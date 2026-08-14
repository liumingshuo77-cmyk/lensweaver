import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

export function makeTestImage(pythonCmd = process.env.VISION_PYTHON ?? "python") {
  const dir = mkdtempSync(join(tmpdir(), "vision-pro-test-"))
  const img = join(dir, "test.png")
  const script =
    "from PIL import Image, ImageDraw; import sys; " +
    "img=Image.new('RGB',(800,200),'white'); " +
    "ImageDraw.Draw(img).text((20,60),'Error: EADDRINUSE port 3000 already in use',fill='black'); " +
    "img.save(sys.argv[1])"
  try {
    execFileSync(pythonCmd, ["-c", script, img])
  } catch (err) {
    throw new Error("cannot create test image (need python + pillow): " + err.message)
  }
  return img
}
