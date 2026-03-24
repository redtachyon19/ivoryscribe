import crypto from "node:crypto";
import { Router } from "express";
import { Op } from "sequelize";
import { Share, Document, User } from "../models/index.js";
import { sendShareInviteEmail, isEmailServiceConfigured } from "../services/email.js";

const { CLIENT_ORIGIN = "http://localhost:5173" } = process.env;

function primaryClientOrigin() {
  return String(CLIENT_ORIGIN).split(",")[0].trim() || "http://localhost:5173";
}

const router = Router();

// POST /api/shares — create a share invite
router.post("/", async (req, res) => {
  try {
    const { documentId, recipientEmail, permission } = req.body;

    if (!documentId || !recipientEmail) {
      return res.status(400).json({ message: "documentId and recipientEmail are required" });
    }

    const normalizedPermission = permission === "edit" ? "edit" : "view";

    const document = await Document.findOne({
      where: { id: documentId, userId: req.user.id },
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found or you are not the owner" });
    }

    if (recipientEmail.toLowerCase() === req.user.email?.toLowerCase()) {
      return res.status(400).json({ message: "You cannot share a project with yourself" });
    }

    // Check for existing active share to same email for same document
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

    const inviteToken = crypto.randomBytes(32).toString("hex");

    const share = await Share.create({
      documentId,
      ownerId: req.user.id,
      recipientEmail: recipientEmail.toLowerCase(),
      permission: normalizedPermission,
      inviteToken,
      status: "pending",
    });

    // Send invite email
    const acceptUrl = `${primaryClientOrigin()}/app?inviteToken=${encodeURIComponent(inviteToken)}`;
    const ownerName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || "Someone";

    if (isEmailServiceConfigured()) {
      try {
        await sendShareInviteEmail({
          to: recipientEmail.toLowerCase(),
          ownerName,
          projectName: document.title,
          permission: normalizedPermission,
          acceptUrl,
        });
      } catch (emailError) {
        console.error("Failed to send share invite email:", emailError.message);
      }
    }

    return res.status(201).json({
      share: {
        id: share.id,
        documentId: share.documentId,
        recipientEmail: share.recipientEmail,
        permission: share.permission,
        status: share.status,
        inviteToken: share.inviteToken,
        createdAt: share.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create share", details: error.message });
  }
});

// GET /api/shares/document/:documentId — list shares for a document you own
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

// PATCH /api/shares/:shareId — update permission or status
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

// DELETE /api/shares/:shareId — revoke a share
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

// POST /api/shares/accept — accept a share invite using token
router.post("/accept", async (req, res) => {
  try {
    const { inviteToken } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ message: "inviteToken is required" });
    }

    const share = await Share.findOne({
      where: { inviteToken, status: "pending" },
    });

    if (!share) {
      return res.status(404).json({ message: "Invite not found or already used" });
    }

    // Verify the accepting user's email matches the invite
    if (req.user.email?.toLowerCase() !== share.recipientEmail.toLowerCase()) {
      return res.status(403).json({
        message: "This invite was sent to a different email address",
        expectedEmail: share.recipientEmail,
      });
    }

    await share.update({
      recipientId: req.user.id,
      status: "accepted",
      acceptedAt: new Date(),
    });

    // Fetch the shared document so the recipient can hydrate it
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
  } catch (error) {
    return res.status(500).json({ message: "Failed to accept invite", details: error.message });
  }
});

// GET /api/shares/invite/:inviteToken — get invite info (for the accept page UI)
router.get("/invite/:inviteToken", async (req, res) => {
  try {
    const share = await Share.findOne({
      where: { inviteToken: req.params.inviteToken, status: "pending" },
      include: [
        { model: User, as: "owner", attributes: ["firstName", "lastName"] },
        { model: Document, as: "document", attributes: ["title"] },
      ],
    });

    if (!share) {
      return res.status(404).json({ message: "Invite not found or already used" });
    }

    return res.status(200).json({
      invite: {
        id: share.id,
        ownerName: [share.owner?.firstName, share.owner?.lastName].filter(Boolean).join(" ") || "Someone",
        projectName: share.document?.title ?? "Untitled Project",
        permission: share.permission,
        recipientEmail: share.recipientEmail,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch invite info", details: error.message });
  }
});

// GET /api/shares/shared-with-me — docs shared with the current user
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
