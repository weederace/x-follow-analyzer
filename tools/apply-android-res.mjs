/*
  apply-android-res.mjs — copies android-res/ into the generated Android project.

  `cap add android` writes a fresh project from Capacitor's template, and android/ is
  gitignored (it is ~200MB of Gradle output). So anything we want in the APK that is not
  a web file has to live somewhere tracked and be copied in afterwards. Without this step
  the app installs with Capacitor's default logo on a white square and its template splash
  screen — which is exactly what happened, and it is not the sort of thing you notice until
  the app is already on your phone.

  Idempotent, and safe to run before the platform exists (it says so and stops).

  Runs automatically from the android:init / android:sync / android:apk scripts.
*/

import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "android-res");
const target = join(root, "android", "app", "src", "main", "res");

if (!existsSync(target)) {
  console.error("android/ is not there yet. Run:  npm run android:init");
  process.exit(1);
}
if (!existsSync(source)) {
  console.error("android-res/ is missing. Regenerate it:  python tools/make_android_icons.py");
  process.exit(1);
}

// Capacitor's eleven splash bitmaps have to go before drawable/splash.xml lands, because
// Android resolves them as variants of the same resource name: on a device matching one of
// those density/orientation folders the PNG would win and the layer-list would never show.
let removed = 0;
for (const dir of readdirSync(target)) {
  if (!dir.startsWith("drawable")) continue;
  const png = join(target, dir, "splash.png");
  if (existsSync(png)) {
    rmSync(png);
    removed += 1;
  }
}

let copied = 0;
const walk = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const here = join(from, entry);
    const there = join(to, entry);
    if (statSync(here).isDirectory()) {
      walk(here, there);
    } else {
      copyFileSync(here, there);
      copied += 1;
      console.log(`  ${relative(root, there).split("\\").join("/")}`);
    }
  }
};
walk(source, target);

console.log(`android-res: ${copied} file${copied === 1 ? "" : "s"} applied, ` +
            `${removed} template splash bitmap${removed === 1 ? "" : "s"} removed`);
