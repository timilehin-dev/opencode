import { NextRequest, NextResponse } from 'next/server';
import {
  isStitchConfigured,
  getStitchStatus,
  listProjects,
  createProject,
  generateScreen,
  generateDesign,
  editScreen,
  generateVariants,
  listScreens,
  fetchHtmlContent,
} from '@/lib/stitch';

// ---------------------------------------------------------------------------
// GET — status, projects, screens
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';

    switch (action) {
      case 'status': {
        return NextResponse.json({
          success: true,
          data: getStitchStatus(),
        });
      }

      case 'projects': {
        if (!isStitchConfigured()) {
          return NextResponse.json(
            { success: false, error: 'STITCH_API_KEY not configured' },
            { status: 400 },
          );
        }
        const projects = await listProjects();
        return NextResponse.json({ success: true, data: { count: projects.length, projects } });
      }

      case 'screens': {
        const projectId = searchParams.get('projectId');
        if (!projectId) {
          return NextResponse.json({ success: false, error: 'Missing projectId' }, { status: 400 });
        }
        const screens = await listScreens(projectId);
        return NextResponse.json({ success: true, data: { count: screens.length, screens } });
      }

      case 'html': {
        const url = searchParams.get('url');
        if (!url) {
          return NextResponse.json({ success: false, error: 'Missing url' }, { status: 400 });
        }
        const html = await fetchHtmlContent(url);
        return NextResponse.json({ success: true, data: { html, length: html.length } });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stitch operation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create-project, generate, generate-one-shot, edit, variants
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    if (!isStitchConfigured()) {
      return NextResponse.json(
        { success: false, error: 'STITCH_API_KEY not configured. Add it to .env.local' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const action = body.action;

    switch (action) {
      case 'create-project': {
        const title = body.title || 'Claw Design';
        const project = await createProject(title);
        return NextResponse.json({ success: true, data: project });
      }

      case 'generate': {
        const { projectId, prompt, deviceType } = body;
        if (!projectId || !prompt) {
          return NextResponse.json(
            { success: false, error: 'Missing projectId or prompt' },
            { status: 400 },
          );
        }
        const result = await generateScreen(projectId, prompt, deviceType || 'DESKTOP');
        return NextResponse.json({ success: result.success, data: result });
      }

      case 'generate-design': {
        const { title, prompt, deviceType } = body;
        if (!prompt) {
          return NextResponse.json({ success: false, error: 'Missing prompt' }, { status: 400 });
        }
        const result = await generateDesign(
          title || 'Claw Design',
          prompt,
          deviceType || 'DESKTOP',
        );
        return NextResponse.json({ success: result.success, data: result });
      }

      case 'edit': {
        const { projectId, screenId, prompt } = body;
        if (!projectId || !screenId || !prompt) {
          return NextResponse.json(
            { success: false, error: 'Missing projectId, screenId, or prompt' },
            { status: 400 },
          );
        }
        const result = await editScreen(projectId, screenId, prompt);
        return NextResponse.json({ success: result.success, data: result });
      }

      case 'variants': {
        const { projectId, screenId, prompt, count, creativeRange, aspects } = body;
        if (!projectId || !screenId || !prompt) {
          return NextResponse.json(
            { success: false, error: 'Missing projectId, screenId, or prompt' },
            { status: 400 },
          );
        }
        const result = await generateVariants(projectId, screenId, prompt, {
          count: count || 3,
          creativeRange: creativeRange || 'EXPLORE',
          aspects: aspects || ['COLOR_SCHEME', 'LAYOUT'],
        });
        return NextResponse.json({ success: result.success, data: result });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stitch operation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
