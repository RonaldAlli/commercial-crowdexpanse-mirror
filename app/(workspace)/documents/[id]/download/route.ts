import fs from "node:fs";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absolutePathFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
  });
  if (!document) {
    return new Response("Not found", { status: 404 });
  }

  const abs = absolutePathFor(document.storageKey);
  if (!abs || !fs.existsSync(abs)) {
    return new Response("File missing", { status: 404 });
  }

  const data = await fs.promises.readFile(abs);
  const asDownload = new URL(request.url).searchParams.get("download") != null;
  const name = (document.originalFilename ?? document.title).replace(/[\r\n"]/g, "_");
  const disposition = `${asDownload ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
