import { Router } from "express";
import { Preference } from "../models/index.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    let preferences = await Preference.findOne({ where: { userId: req.user.id } });

    if (!preferences) {
      preferences = await Preference.create({ userId: req.user.id });
    }

    return res.status(200).json({ preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch preferences", details: error.message });
  }
});

router.put("/", async (req, res) => {
  try {
    let preferences = await Preference.findOne({ where: { userId: req.user.id } });

    if (!preferences) {
      preferences = await Preference.create({ userId: req.user.id });
    }

    const nextTheme = Object.hasOwn(req.body, "theme") ? req.body.theme : preferences.theme;
    const nextEditorSettings = Object.hasOwn(req.body, "editorSettings")
      ? req.body.editorSettings
      : preferences.editorSettings;
    const nextUiSettings = Object.hasOwn(req.body, "uiSettings") ? req.body.uiSettings : preferences.uiSettings;

    await preferences.update({
      theme: nextTheme,
      editorSettings: nextEditorSettings,
      uiSettings: nextUiSettings,
    });

    return res.status(200).json({ preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save preferences", details: error.message });
  }
});

export default router;
