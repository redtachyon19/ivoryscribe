import { Router } from "express";
import { Document, Preference } from "../models/index.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const [documents, preferences] = await Promise.all([
      Document.findAll({ where: { userId: req.user.id }, order: [["updatedAt", "DESC"]] }),
      Preference.findOne({ where: { userId: req.user.id } }),
    ]);

    return res.status(200).json({
      documents,
      preferences,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to sync user data", details: error.message });
  }
});

router.post("/push", async (req, res) => {
  try {
    const docsInput = Array.isArray(req.body.documents) ? req.body.documents : [];
    const prefsInput = req.body.preferences;

    for (const docInput of docsInput) {
      if (docInput?.id) {
        const existing = await Document.findOne({ where: { id: docInput.id, userId: req.user.id } });

        if (existing) {
          await existing.update({
            title: docInput.title ?? existing.title,
            content: docInput.content ?? existing.content,
            theme: docInput.theme ?? existing.theme,
            metadata: docInput.metadata ?? existing.metadata,
          });
          continue;
        }
      }

      await Document.create({
        userId: req.user.id,
        title: docInput.title ?? "Untitled Document",
        content: docInput.content ?? "",
        theme: docInput.theme ?? {},
        metadata: docInput.metadata ?? {},
      });
    }

    if (prefsInput) {
      let preferences = await Preference.findOne({ where: { userId: req.user.id } });
      if (!preferences) {
        preferences = await Preference.create({ userId: req.user.id });
      }

      await preferences.update({
        theme: prefsInput.theme ?? preferences.theme,
        editorSettings: prefsInput.editorSettings ?? preferences.editorSettings,
        uiSettings: prefsInput.uiSettings ?? preferences.uiSettings,
      });
    }

    const [documents, preferences] = await Promise.all([
      Document.findAll({ where: { userId: req.user.id }, order: [["updatedAt", "DESC"]] }),
      Preference.findOne({ where: { userId: req.user.id } }),
    ]);

    return res.status(200).json({ documents, preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to push sync data", details: error.message });
  }
});

export default router;
