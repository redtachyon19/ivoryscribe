import { Router } from "express";
import { Op } from "sequelize";
import { Share, Document, User } from "../models/index.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { documentId, recipientEmail, permission } = req.body;

    if (!documentId || !recipientEmail) {
      return res.status(400).json({ message: "documentId and recipientEmail are required" });
    }

    const normalizedPermission = permission === "view" ? "view" : "edit";

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
    return res.status(500).json({ message: "Failed to create share", details: error.message });
  }
});

router.get("/document/:documentId", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to fetch shares", details: error.message });
  }
});

router.post("/transfer-ownership", async (req, res) => {
  try {
    const { documentId, recipientEmail } = req.body;

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

    const newOwnerId = share.recipientId;
    const oldOwnerEmail = req.user.email;

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
    return res.status(500).json({ message: "Failed to transfer ownership", details: error.message });
  }
});

router.patch("/:shareId", async (req, res) => {
  try {
    const share = await Share.findOne({
      where: { id: req.params.shareId, ownerId: req.user.id },
    });

    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }

    const updates = {};

    if (req.body.permission && ["view", "edit"].includes(req.body.permission)) {
      updates.permission = req.body.permission;
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
    return res.status(500).json({ message: "Failed to update share", details: error.message });
  }
});

router.delete("/:shareId", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to revoke share", details: error.message });
  }
});

router.post("/:shareId/respond", async (req, res) => {
  try {
    const { action } = req.body;

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
    return res.status(500).json({ message: "Failed to respond to share request", details: error.message });
  }
});

router.post("/:shareId/leave", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to leave shared project", details: error.message });
  }
});

router.get("/pending-requests", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to fetch pending requests", details: error.message });
  }
});

router.get("/shared-with-me", async (req, res) => {
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
    return res.status(500).json({ message: "Failed to fetch shared documents", details: error.message });
  }
});

export default router;
