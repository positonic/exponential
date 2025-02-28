import { PrismaClient, type Prisma } from "@prisma/client";

export class VideoRepository {
  constructor(private prisma: PrismaClient) {}

  async updateVideoContent(videoId: string, data: {
    summary?: string;
    description?: string;
  }) {
    return this.prisma.video.update({
      where: { id: videoId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async saveSummary(videoId: string | undefined, content: string, summaryType: string, videoUrl?: string) {
    
    console.log("saveSummary: videoId: ", videoId)
    console.log("saveSummary: content: ", content)
    console.log("saveSummary: summaryType: ", summaryType)
    console.log("saveSummary: videoUrl: ", videoUrl)
    // Validate input parameters based on summary type
    if (summaryType === 'description') {
      if (!videoUrl) {
        throw new Error('videoUrl is required for description summary type');
      }
    } else if (summaryType === 'basic') {
      if (!videoId) {
        throw new Error('videoId is required for basic summary type');
      }
    } else {
      throw new Error(`Invalid summary type: ${summaryType}`);
    }

    const data = summaryType === 'description' 
      ? { description: content }
      : { summary: content };
    
    return this.prisma.video.update({
      where: summaryType === 'description' 
        ? { videoUrl } 
        : { slug: videoId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async createVideo(data: {
    videoUrl: string;
    status: string;
    slug?: string;
    userId: string;
    isSearchable?: boolean;
  }) {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const video = await tx.video.create({
        data: {
          id: crypto.randomUUID(),
          videoUrl: data.videoUrl,
          status: data.status,
          slug: data.slug,
          isSearchable: data.isSearchable,
          users: {
            create: {
              userId: data.userId
            }
          }
        }
      });
      return video;
    });
  }

  async updateVideo(id: string, data: {
    slug?: string;
    title?: string;
    videoUrl?: string;
    transcription?: string;
    status?: string;
    isSearchable?: boolean;
    updatedAt?: Date;
  }) {
    return this.prisma.video.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async getVideo(id: string) {
    return this.prisma.video.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });
  }

  async getVideoBySlug(slug: string) {
    return this.prisma.video.findFirst({
      where: { slug },
      include: {
        users: true,
      },
    });
  }

  async getVideos() {
    return this.prisma.video.findMany({
      include: {
        users: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deleteVideo(id: string) {
    return this.prisma.video.delete({
      where: { id },
    });
  }

  async getVideoByUrl(videoUrl: string) {
    return await this.prisma.video.findUnique({
      where: { videoUrl }
    });
  }

  async getUserVideo(userId: string, videoId: string) {
    return await this.prisma.userVideo.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });
  }

  async createUserVideo(userId: string, videoId: string) {
    return await this.prisma.userVideo.create({
      data: {
        userId,
        videoId
      }
    });
  }
}