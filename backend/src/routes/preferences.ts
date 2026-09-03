import { Router, type Request, type Response } from "express";
import { Preference } from "../models/index.ts";
import { errorMessage } from "../lib/errors.ts";

const router = Router();

type PreferencesBody = {
  theme?: Record<string, unknown>;
  editorSettings?: Record<string, unknown>;
  uiSettings?: Record<string, unknown>;
};

router.get("/", async (req: Request, res: Response) => {
  try {
    let preferences = await Preference.findOne({ where: { userId: req.user.id } });

    if (!preferences) {
      preferences = await Preference.create({ userId: req.user.id });
    }

    return res.status(200).json({ preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch preferences", details: errorMessage(error) });
  }
});

router.put("/", async (req: Request<unknown, unknown, PreferencesBody>, res: Response) => {
  try {
    let preferences = await Preference.findOne({ where: { userId: req.user.id } });

    if (!preferences) {
      preferences = await Preference.create({ userId: req.user.id });
    }

    const body = req.body ?? {};
    const nextTheme = Object.hasOwn(body, "theme") ? body.theme : preferences.theme;
    const nextEditorSettings = Object.hasOwn(body, "editorSettings")
      ? body.editorSettings
      : preferences.editorSettings;
    const nextUiSettings = Object.hasOwn(body, "uiSettings") ? body.uiSettings : preferences.uiSettings;

    await preferences.update({
      theme: nextTheme,
      editorSettings: nextEditorSettings,
      uiSettings: nextUiSettings,
    });

    return res.status(200).json({ preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save preferences", details: errorMessage(error) });
  }
});

export default router;
