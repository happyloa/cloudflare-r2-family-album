import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/ensure-admin';
import { calculateBucketUsage } from '@/lib/r2';

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const force = request.nextUrl.searchParams.get("force") === "true";
    const usage = await calculateBucketUsage(force);
    return NextResponse.json(usage);
  } catch (error) {
    console.error('Failed to calculate bucket usage', error);
    return NextResponse.json({ error: '無法取得貯體容量，請稍後再試。' }, { status: 500 });
  }
}

