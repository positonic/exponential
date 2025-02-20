-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT,
    "videoUrl" TEXT NOT NULL,
    "transcription" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "isSearchable" BOOLEAN DEFAULT false,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoChunk" (
    "id" SERIAL NOT NULL,
    "video_id" TEXT,
    "chunk_text" TEXT NOT NULL,
    "chunk_start" INTEGER,
    "chunk_end" INTEGER,
    "chunk_start_time" DOUBLE PRECISION,
    "chunk_end_time" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoChunk_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoChunk" ADD CONSTRAINT "VideoChunk_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
