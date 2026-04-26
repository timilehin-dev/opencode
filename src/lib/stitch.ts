// src/lib/stitch.ts
// Google Stitch API integration — vibe design platform
// Generates high-fidelity UI designs from text prompts, extracts HTML/CSS + screenshots

import { stitch, StitchToolClient, StitchError } from '@google/stitch-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StitchProject {
  id: string;
  title: string;
  screenCount?: number;
  thumbnail?: string;
  createTime?: string;
  updateTime?: string;
}

export interface StitchScreenData {
  id: string;
  projectId: string;
  prompt?: string;
  htmlUrl?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
}

export interface DesignResult {
  success: boolean;
  projectId: string;
  projectTitle: string;
  screenId: string;
  htmlUrl: string;
  imageUrl: string;
  prompt: string;
  deviceType: string;
  createdAt: string;
  error?: string;
}

export interface EditResult {
  success: boolean;
  screenId: string;
  htmlUrl: string;
  imageUrl: string;
  editPrompt: string;
  error?: string;
}

export interface VariantResult {
  success: boolean;
  variants: Array<{
    screenId: string;
    htmlUrl: string;
    imageUrl: string;
  }>;
  prompt: string;
  count: number;
  error?: string;
}

export type DeviceType = 'MOBILE' | 'DESKTOP' | 'TABLET' | 'AGNOSTIC';
export type CreativeRange = 'REFINE' | 'EXPLORE' | 'REIMAGINE';
export type DesignAspect = 'LAYOUT' | 'COLOR_SCHEME' | 'IMAGES' | 'TEXT_FONT' | 'TEXT_CONTENT';

// ---------------------------------------------------------------------------
// Client helper
// ---------------------------------------------------------------------------

function getStitch() {
  if (!process.env.STITCH_API_KEY) {
    throw new Error('STITCH_API_KEY not configured. Add it to .env.local');
  }
  return stitch;
}

// ---------------------------------------------------------------------------
// Project Operations
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<StitchProject[]> {
  const s = getStitch();
  const projects = await s.projects();
  return projects.map((p: any) => ({
    id: p.projectId || p.id,
    title: p.title || p.name || 'Untitled',
    screenCount: p.screenInstances?.length,
    thumbnail: p.thumbnailScreenshot?.downloadUrl,
    createTime: p.createTime,
    updateTime: p.updateTime,
  }));
}

export async function getProject(projectId: string): Promise<StitchProject | null> {
  try {
    const s = getStitch();
    const project = s.project(projectId);
    const data = await (project as any).getData?.() || {};
    return {
      id: projectId,
      title: data.title || data.name || 'Untitled',
      screenCount: data.screenInstances?.length,
      thumbnail: data.thumbnailScreenshot?.downloadUrl,
      createTime: data.createTime,
      updateTime: data.updateTime,
    };
  } catch (err) {
    if (err instanceof StitchError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

export async function createProject(title: string): Promise<StitchProject> {
  const s = getStitch();
  const project = await s.createProject(title);
  return {
    id: (project as any).projectId || (project as any).id,
    title,
    createTime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Screen Generation
// ---------------------------------------------------------------------------

export async function generateScreen(
  projectId: string,
  prompt: string,
  deviceType: DeviceType = 'DESKTOP',
): Promise<DesignResult> {
  try {
    const s = getStitch();
    const project = s.project(projectId);
    const screen = await project.generate(prompt, deviceType as any);

    const screenId = (screen as any).screenId || (screen as any).id || '';
    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();

    return {
      success: true,
      projectId,
      projectTitle: '',
      screenId,
      htmlUrl: htmlUrl || '',
      imageUrl: imageUrl || '',
      prompt,
      deviceType,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      projectId,
      projectTitle: '',
      screenId: '',
      htmlUrl: '',
      imageUrl: '',
      prompt,
      deviceType,
      createdAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Generation failed',
    };
  }
}

/**
 * Generate a screen in a new project (one-shot convenience function)
 */
export async function generateDesign(
  title: string,
  prompt: string,
  deviceType: DeviceType = 'DESKTOP',
): Promise<DesignResult> {
  const project = await createProject(title);
  const result = await generateScreen(project.id, prompt, deviceType);
  result.projectTitle = title;
  return result;
}

// ---------------------------------------------------------------------------
// Screen Editing & Variants
// ---------------------------------------------------------------------------

export async function editScreen(
  projectId: string,
  screenId: string,
  prompt: string,
): Promise<EditResult> {
  try {
    const s = getStitch();
    const project = s.project(projectId);
    const screen = await (project as any).getScreen(screenId);
    const edited = await screen.edit(prompt);

    const htmlUrl = await edited.getHtml();
    const imageUrl = await edited.getImage();

    return {
      success: true,
      screenId: (edited as any).screenId || (edited as any).id || screenId,
      htmlUrl: htmlUrl || '',
      imageUrl: imageUrl || '',
      editPrompt: prompt,
    };
  } catch (err) {
    return {
      success: false,
      screenId,
      htmlUrl: '',
      imageUrl: '',
      editPrompt: prompt,
      error: err instanceof Error ? err.message : 'Edit failed',
    };
  }
}

export async function generateVariants(
  projectId: string,
  screenId: string,
  prompt: string,
  options: {
    count?: number;
    creativeRange?: CreativeRange;
    aspects?: DesignAspect[];
  } = {},
): Promise<VariantResult> {
  try {
    const s = getStitch();
    const project = s.project(projectId);
    const screen = await (project as any).getScreen(screenId);

    const variants = await screen.variants(prompt, {
      variantCount: options.count || 3,
      creativeRange: options.creativeRange || 'EXPLORE',
      aspects: options.aspects,
    });

    const variantData = await Promise.all(
      variants.map(async (v: any) => ({
        screenId: (v as any).screenId || (v as any).id || '',
        htmlUrl: (await v.getHtml()) || '',
        imageUrl: (await v.getImage()) || '',
      })),
    );

    return {
      success: true,
      variants: variantData,
      prompt,
      count: variantData.length,
    };
  } catch (err) {
    return {
      success: false,
      variants: [],
      prompt,
      count: 0,
      error: err instanceof Error ? err.message : 'Variant generation failed',
    };
  }
}

// ---------------------------------------------------------------------------
// List Screens in a Project
// ---------------------------------------------------------------------------

export async function listScreens(projectId: string): Promise<StitchScreenData[]> {
  const s = getStitch();
  const project = s.project(projectId);
  const screens = await project.screens();
  return screens.map((sc: any) => ({
    id: (sc as any).screenId || (sc as any).id || '',
    projectId,
    width: sc.width,
    height: sc.height,
  }));
}

// ---------------------------------------------------------------------------
// Fetch HTML Content from a URL
// ---------------------------------------------------------------------------

export async function fetchHtmlContent(htmlUrl: string): Promise<string> {
  try {
    const response = await fetch(htmlUrl, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (err) {
    throw new Error(`Failed to fetch HTML: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// ---------------------------------------------------------------------------
// Check if Stitch is configured
// ---------------------------------------------------------------------------

export function isStitchConfigured(): boolean {
  return !!process.env.STITCH_API_KEY;
}

export function getStitchStatus(): {
  configured: boolean;
  hasApiKey: boolean;
} {
  return {
    configured: !!process.env.STITCH_API_KEY,
    hasApiKey: !!process.env.STITCH_API_KEY,
  };
}
