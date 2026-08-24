import { Router, type Request, type Response } from "express";
import { Document, Share } from "../models/index.ts";
import { errorMessage } from "../lib/errors.ts";

const router = Router();

type DocumentBody = {
  title?: string;
  content?: string;
  theme?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type IdParams = { id: string };

const UPDATABLE_FIELDS = ["title", "content", "theme", "metadata"] as const;
type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

router.get("/", async (req: Request, res: Response) => {
  try {
    const documents = await Document.findAll({
      where: { userId: req.user.id },
      order: [["updatedAt", "DESC"]],
    });

    return res.status(200).json({ documents });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch documents", details: errorMessage(error) });
  }
});

router.post("/", async (req: Request<unknown, unknown, DocumentBody>, res: Response) => {
  try {
    const { title, content, theme, metadata } = req.body ?? {};

    const document = await Document.create({
      userId: req.user.id,
      title: title ?? "Untitled Document",
      content: content ?? "",
      theme: theme ?? {},
      metadata: metadata ?? {},
    });

    return res.status(201).json({ document });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create document", details: errorMessage(error) });
  }
});

router.get("/:id", async (req: Request<IdParams>, res: Response) => {
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
    return res.status(500).json({ message: "Failed to fetch document", details: errorMessage(error) });
  }
});

router.patch("/:id", async (req: Request<IdParams, unknown, DocumentBody>, res: Response) => {
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

    const body = req.body ?? {};
    const updates: Partial<Pick<DocumentBody, UpdatableField>> = {};

    for (const field of UPDATABLE_FIELDS) {
      if (Object.hasOwn(body, field)) {
        // Narrowed per key so the assignment stays typed rather than going
        // through an index signature.
        if (field === "title") updates.title = body.title;
        else if (field === "content") updates.content = body.content;
        else if (field === "theme") updates.theme = body.theme;
        else updates.metadata = body.metadata;
      }
    }

    await document.update(updates);

    return res.status(200).json({ document });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update document", details: errorMessage(error) });
  }
});

router.delete("/:id", async (req: Request<IdParams>, res: Response) => {
  try {
    const deleted = await Document.destroy({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!deleted) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete document", details: errorMessage(error) });
  }
});

export default router;
