// ---------------------------------------------------------------------------
// Design Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  generateDesign, editScreen, generateVariants } from "./shared";

// ---------------------------------------------------------------------------
// Design Generate Tool (Stitch)
// ---------------------------------------------------------------------------

export const designGenerateTool = tool({
  description: "Generate a high-fidelity UI design from a text prompt using the Stitch design platform. Creates a new project with a single screen.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the design project"),
    prompt: z.string().describe("Description of the UI design to generate"),
    deviceType: z.enum(["MOBILE", "DESKTOP", "TABLET"]).optional().describe("Target device type (default: 'DESKTOP')"),
  })),
  execute: safeJson(async ({ title, prompt, deviceType }) => {
    const result = await generateDesign(title, prompt, (deviceType || "DESKTOP") as "MOBILE" | "DESKTOP" | "TABLET");
    return {
      projectId: result.projectId,
      screenId: result.screenId,
      imageUrl: result.imageUrl,
      htmlUrl: result.htmlUrl,
      success: result.success,
      error: result.error,
    };
  }),
});

// ---------------------------------------------------------------------------
// Design Edit Tool (Stitch)
// ---------------------------------------------------------------------------

export const designEditTool = tool({
  description: "Edit an existing Stitch design screen using a text prompt. Modifies the design based on the instruction.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().describe("The Stitch project ID"),
    screenId: z.string().describe("The screen ID to edit"),
    prompt: z.string().describe("Instructions for what to change in the design"),
  })),
  execute: safeJson(async ({ projectId, screenId, prompt }) => {
    const result = await editScreen(projectId, screenId, prompt);
    return {
      screenId: result.screenId,
      imageUrl: result.imageUrl,
      htmlUrl: result.htmlUrl,
      success: result.success,
      error: result.error,
    };
  }),
});

// ---------------------------------------------------------------------------
// Design Variants Tool (Stitch)
// ---------------------------------------------------------------------------

export const designVariantsTool = tool({
  description: "Generate design variants of an existing Stitch screen. Creates multiple alternative designs based on the prompt.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().describe("The Stitch project ID"),
    screenId: z.string().describe("The screen ID to generate variants for"),
    prompt: z.string().describe("Description of what variations to explore"),
    count: z.number().optional().describe("Number of variants to generate (default: 3)"),
  })),
  execute: safeJson(async ({ projectId, screenId, prompt, count }) => {
    const result = await generateVariants(projectId, screenId, prompt, { count: count || 3 });
    return {
      variants: result.variants,
      count: result.count,
      success: result.success,
      error: result.error,
    };
  }),
});

