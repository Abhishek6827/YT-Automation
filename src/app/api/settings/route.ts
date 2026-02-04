import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/settings - Get user and their automation jobs
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const query = {
            where: { id: session.user.id },
            include: {
                jobs: {
                    orderBy: { createdAt: 'desc' as const }
                }
            }
        };
        const user = await prisma.user.findUnique(query);

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        return NextResponse.json({
            jobs: user.jobs
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

// POST /api/settings - Create or Update Automation Job
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, name, driveFolderLink, uploadHour, videosPerDay, enabled, action } = body;

        // DELETE action
        if (action === 'delete' && id) {
            await prisma.automationJob.deleteMany({
                where: {
                    id: id,
                    userId: session.user.id // Ensure ownership
                }
            });
            return NextResponse.json({ success: true });
        }

        // Validate common fields
        if (!driveFolderLink) {
            return NextResponse.json({ error: 'Drive Link is required' }, { status: 400 });
        }

        const jobData = {
            name: name || 'My Automation',
            driveFolderLink: driveFolderLink.trim(),
            uploadHour: Number(uploadHour) || 10,
            videosPerDay: Number(videosPerDay) || 1,
            enabled: enabled !== undefined ? enabled : true,
        };

        if (id) {
            // Update existing job
            const updatedJob = await prisma.automationJob.updateMany({
                where: { id: id, userId: session.user.id },
                data: jobData
            });
            return NextResponse.json(updatedJob);
        } else {
            // Create new job
            const newJob = await prisma.automationJob.create({
                data: {
                    userId: session.user.id,
                    ...jobData
                }
            });
            return NextResponse.json(newJob);
        }

    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
