import { Router, type Request, type Response } from "express";
import { Op } from "sequelize";
import { Share, Document, User } from "../models/index.ts";
import type { SharePermission } from "../models/share.ts";
import { errorMessage } from "../lib/errors.ts";

const router = Router();

/**
 * Request bodies describe the shape the client is expected to send. The
 * handlers keep their original runtime guards — these annotations do not
 * validate anything at runtime, they only stop `req.body` being `any`.
 */
type CreateShareBody = { documentId?: string; recipientEmail?: string; permission?: string };
type TransferOwnershipBody = { documentId?: string; recipientEmail?: string };
type PatchShareBody = { permission?: string };
type RespondBody = { action?: string };

router.post("/", async (req: Request<unknown, unknown, CreateShareBody>, res: Response) => {
  try {
    const { documentId, recipientEmail, permission } = req.body ?? {};

    if (!documentId || !recipientEmail) {
      return res.status(400).json({ message: "documentId and recipientEmail are required" });
    }

    const normalizedPermission: SharePermission = permission === "view" ? "view" : "edit";

    const document = await Document.findOne({
      where: { id: documentId, userId: req.user.id },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found or you are not the owner" });
    }

    if (recipientEmail.toLowerCase() === req.user.email?.toLowerCase()) {
      return res.status(400).json({ message: "You cannot share a project with yourself" });
    }

    const recipient = await User.findOne({
      where: { email: recipientEmail.toLowerCase() },
    });

    if (!recipient) {
      return res.status(404).json({ message: "No user found with that email address" });
    }

    const existingShare = await Share.findOne({
      where: {
        documentId,
        recipientEmail: recipientEmail.toLowerCase(),
        status: { [Op.in]: ["pending", "accepted"] },
      },
    });

    if (existingShare) {
      return res.status(409).json({ message: "This project is already shared with that email address" });
    }

    const share = await Share.create({
      documentId,
      ownerId: req.user.id,
      recipientId: recipient.id,
      recipientEmail: recipientEmail.toLowerCase(),
      permission: normalizedPermission,
      status: "pending",
    });

    return res.status(201).json({
      share: {
        id: share.id,
        documentId: share.documentId,
        recipientEmail: share.recipientEmail,
        permission: share.permission,
        status: share.status,
        createdAt: share.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create share", details: errorMessage(error) });
  }
});

router.get("/document/:documentId", async (req: Request<{ documentId: string }>, res: Response) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.documentId, userId: req.user.id },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found or you are not the owner" });
    }

    const shares = await Share.findAll({
      where: {
        documentId: req.params.documentId,
        status: { [Op.in]: ["pending", "accepted"] },
      },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      shares: shares.map((s) => ({
        id: s.id,
        documentId: s.documentId,
        recipientEmail: s.recipientEmail,
        recipientId: s.recipientId,
        permission: s.permission,
        status: s.status,
        createdAt: s.createdAt,
        acceptedAt: s.acceptedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch shares", details: errorMessage(error) });
  }
});

router.post("/transfer-ownership", async (req: Request<unknown, unknown, TransferOwnershipBody>, res: Response) => {
  try {
    const { documentId, recipientEmail } = req.body ?? {};

    if (!documentId || !recipientEmail) {
      return res.status(400).json({ message: "documentId and recipientEmail are required" });
    }

    const document = await Document.findOne({
      where: { id: documentId, userId: req.user.id },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found or you are not the owner" });
    }

    const share = await Share.findOne({
      where: {
        documentId,
        recipientEmail: recipientEmail.toLowerCase(),
        ownerId: req.user.id,
        status: "accepted",
      },
    });

    if (!share) {
      return res.status(404).json({ message: "No accepted collaborator found with that email" });
    }

    // Both of these columns are NOT NULL on shares, but recipientId and the
    // owner's email are both nullable on their own tables. Previously a null
    // here reached the INSERT and surfaced as an opaque validation failure
    // after the document had already been reassigned; failing first keeps the
    // transfer atomic. The throw lands in the same catch, so the response
    // shape is unchanged.
    const newOwnerId = share.recipientId;
    if (!newOwnerId) {
      throw new Error("Collaborator has no linked account to receive ownership");
    }

    const oldOwnerEmail = req.user.email;
    if (!oldOwnerEmail) {
      throw new Error("Current owner has no email address to record on the new share");
    }

    await document.update({ userId: newOwnerId });

    await share.update({ status: "revoked" });

    await Share.create({
      documentId,
      ownerId: newOwnerId,
      recipientId: req.user.id,
      recipientEmail: oldOwnerEmail,
      permission: "edit",
      status: "accepted",
      acceptedAt: new Date(),
    });

    return res.status(200).json({ message: "Ownership transferred successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to transfer ownership", details: errorMessage(error) });
  }
});

router.patch("/:shareId", async (req: Request<{ shareId: string }, unknown, PatchShareBody>, res: Response) => {
  try {
    const share = await Share.findOne({
      where: { id: req.params.shareId, ownerId: req.user.id },
    });

    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }

    const updates: { permission?: SharePermission } = {};
    const requestedPermission = req.body?.permission;

    if (requestedPermission === "view" || requestedPermission === "edit") {
      updates.permission = requestedPermission;
    }

    await share.update(updates);

    return res.status(200).json({
      share: {
        id: share.id,
        documentId: share.documentId,
        recipientEmail: share.recipientEmail,
        permission: share.permission,
        status: share.status,
        createdAt: share.createdAt,
        acceptedAt: share.acceptedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update share", details: errorMessage(error) });
  }
});

router.delete("/:shareId", async (req: Request<{ shareId: string }>, res: Response) => {
  try {
    const share = await Share.findOne({
      where: { id: req.params.shareId, ownerId: req.user.id },
    });

    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }

    await share.update({ status: "revoked" });

    return res.status(200).json({ message: "Share access revoked" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to revoke share", details: errorMessage(error) });
  }
});

router.post("/:shareId/respond", async (req: Request<{ shareId: string }, unknown, RespondBody>, res: Response) => {
  try {
    const { action } = req.body ?? {};

    if (!action || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be 'accept' or 'reject'" });
    }

    const share = await Share.findOne({
      where: {
        id: req.params.shareId,
        recipientId: req.user.id,
        status: "pending",
      },
    });

    if (!share) {
      return res.status(404).json({ message: "Share request not found" });
    }

    if (action === "accept") {
      await share.update({
        status: "accepted",
        acceptedAt: new Date(),
      });

      const document = await Document.findByPk(share.documentId);

      return res.status(200).json({
        share: {
          id: share.id,
          documentId: share.documentId,
          permission: share.permission,
          status: share.status,
          acceptedAt: share.acceptedAt,
        },
        document: document
          ? {
              id: document.id,
              title: document.title,
              content: document.content,
              theme: document.theme,
              metadata: document.metadata,
              createdAt: document.createdAt,
              updatedAt: document.updatedAt,
            }
          : null,
      });
    }

    await share.update({ status: "rejected" });
    return res.status(200).json({ message: "Share request rejected" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to respond to share request", details: errorMessage(error) });
  }
});

router.post("/:shareId/leave", async (req: Request<{ shareId: string }>, res: Response) => {
  try {
    const share = await Share.findOne({
      where: {
        id: req.params.shareId,
        recipientId: req.user.id,
        status: "accepted",
      },
    });

    if (!share) {
      return res.status(404).json({ message: "Accepted share not found" });
    }

    await share.update({ status: "rejected" });

    return res.status(200).json({ message: "You have left this shared project" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to leave shared project", details: errorMessage(error) });
  }
});

router.get("/pending-requests", async (req: Request, res: Response) => {
  try {
    const shares = await Share.findAll({
      where: {
        recipientId: req.user.id,
        status: "pending",
      },
      include: [
        { model: User, as: "owner", attributes: ["id", "firstName", "lastName", "email"] },
        { model: Document, as: "document", attributes: ["id", "title"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      pendingRequests: shares.map((s) => ({
        id: s.id,
        permission: s.permission,
        createdAt: s.createdAt,
        owner: {
          id: s.owner?.id,
          name: [s.owner?.firstName, s.owner?.lastName].filter(Boolean).join(" "),
          email: s.owner?.email,
        },
        projectName: s.document?.title ?? "Untitled Project",
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch pending requests", details: errorMessage(error) });
  }
});

router.get("/shared-with-me", async (req: Request, res: Response) => {
  try {
    const shares = await Share.findAll({
      where: {
        recipientId: req.user.id,
        status: "accepted",
      },
      include: [
        { model: Document, as: "document" },
        { model: User, as: "owner", attributes: ["id", "firstName", "lastName", "email"] },
      ],
      order: [["acceptedAt", "DESC"]],
    });

    return res.status(200).json({
      sharedDocuments: shares.map((s) => ({
        shareId: s.id,
        permission: s.permission,
        acceptedAt: s.acceptedAt,
        owner: {
          id: s.owner?.id,
          name: [s.owner?.firstName, s.owner?.lastName].filter(Boolean).join(" "),
          email: s.owner?.email,
        },
        document: s.document
          ? {
              id: s.document.id,
              title: s.document.title,
              content: s.document.content,
              theme: s.document.theme,
              metadata: s.document.metadata,
              createdAt: s.document.createdAt,
              updatedAt: s.document.updatedAt,
            }
          : null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch shared documents", details: errorMessage(error) });
  }
});

export default router;
