import { Router } from "express";
import { Document, Share } from "../models/index.js";
import { Op } from "sequelize";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const documents = await Document.findAll({
      where: { userId: req.user.id },
      order: [["updatedAt", "DESC"]],
    });

    return res.status(200).json({ documents });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch documents", details: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, content, theme, metadata } = req.body;

    const document = await Document.create({
      userId: req.user.id,
      title: title ?? "Untitled Document",
      content: content ?? "",
      theme: theme ?? {},
      metadata: metadata ?? {},
    });

    return res.status(201).json({ document });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create document", details: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    let document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!document) {
      const share = await Share.findOne({
        where: {
          documentId: req.params.id,
          recipientId: req.user.id,
          status: "accepted",
        },
      });

      if (share) {
        document = await Document.findByPk(req.params.id);
      }
    }

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.status(200).json({ document });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch document", details: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    let document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!document) {
      const share = await Share.findOne({
        where: {
          documentId: req.params.id,
          recipientId: req.user.id,
          status: "accepted",
        },
      });

      if (!share) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (share.permission !== "edit") {
        return res.status(403).json({ message: "You have view-only access to this document" });
      }

      document = await Document.findByPk(req.params.id);
    }

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const updates = {};
    const allowedFields = ["title", "content", "theme", "metadata"];

    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    await document.update(updates);

    return res.status(200).json({ document });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update document", details: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Document.destroy({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!deleted) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete document", details: error.message });
  }
});

export default router;
