import { z } from "zod";

export const b2Schema = z.object({ language: z.enum(["en", "zh", "ja"]), insufficient: z.boolean(),
  claims: z.array(z.object({ text: z.string().min(1).max(1200), evidenceKeys: z.array(z.string()).min(1).max(3) })).max(8),
  recommendedProjectIds: z.array(z.string()).max(2), followUpQuestions: z.array(z.string().min(3).max(180)).max(3) });
export type ModelClaims = Omit<z.infer<typeof b2Schema>, "followUpQuestions"> & { followUpQuestions?: string[] };
