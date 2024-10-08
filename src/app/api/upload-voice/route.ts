import { NextRequest, NextResponse } from 'next/server';
import { Dropbox, DropboxAuth } from 'dropbox';
import fetch from 'node-fetch';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cookieStore = request.cookies;
  const accessToken = cookieStore.get('dropboxAccessToken')?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated with Dropbox' },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const email = formData.get('email') as string;
  const file = formData.get('file') as File;

  if (!email || !file) {
    return NextResponse.json(
      { error: 'Please provide an email and a voice recording' },
      { status: 400 }
    );
  }

  try {
    const dbxAuth = new DropboxAuth({ accessToken, fetch });
    const dbx = new Dropbox({ auth: dbxAuth, fetch });

    const contents = Buffer.from(await file.arrayBuffer());

    const uploadResponse = await dbx.filesUpload({
      path: `/voice_recordings/${file.name}`,
      contents: contents,
      mode: { '.tag': 'overwrite' },
    });

    const sharedLinkResponse = await dbx.sharingCreateSharedLinkWithSettings({
      path: uploadResponse.result.path_lower!,
    });

    const fileUrl = sharedLinkResponse.result.url.replace('?dl=0', '?raw=1');

    // Send data to Make.com webhook for voice recordings
    const response = await fetch(process.env.MAKE_VOICE_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        fileUrl,
        fileType: 'voice_recording'
      }),
    });

    if (!response.ok) {
      throw new Error(`Make.com webhook responded with status ${response.status}`);
    }

    return NextResponse.json({ success: true, fileUrl });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}