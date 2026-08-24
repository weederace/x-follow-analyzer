# X Follow Analyzer

پیدا کردن حساب‌هایی که فالو می‌کنی و فالوت نکرده‌اند — با خواندن آرشیو رسمی X، کامل روی دستگاه خودت.

بدون توکن، بدون لاگین، بدون API توییتر. آرشیو ZIP همان‌جا که هست خوانده می‌شود و هیچ فایلی به هیچ سروری نمی‌رود. اگر کابل شبکه را بکشی، همه‌چیز کار می‌کند — مگر خودِ باز کردن پروفایل‌ها در مرورگر.

*Find the accounts you follow who never followed you back, by reading your official X archive entirely on your own device. Scroll down for [English](#english).*

---

## اینجا کار چطور پیش می‌رود

رابط، داشبورد آماری نیست؛ یک **میز تریاژ** است: هر بار یک حساب روی کارت وسط صفحه می‌آید، تصمیم می‌گیری، کارت می‌رود، و شمارنده یکی کم می‌شود. عدد کل و نمودار کاری از پیش نمی‌برند، پس آمار به یک ستون نازک کنار صفحه تبعید شده.

دو تصمیم داری. **باز کردن و ثبت** (`Enter`) پروفایل را در تب تازه باز می‌کند و همان لحظه در تاریخچه ثبتش می‌کند تا دیگر هرگز نبینی‌اش. **بعدی** (`Space`) کارت را به آخر صف می‌فرستد؛ رد کردن، پیشرفت نیست، پس شمارنده تکان نمی‌خورد. اگر اشتباه زدی، `U` آخرین ثبت را برمی‌گرداند و حساب را به بالای صف می‌آورد.

اولین باری که باز می‌کنی یک کارت خوش‌آمدگویی توضیح می‌دهد آرشیو X چیست و از کجا باید بگیری؛ بعد از بستنش، تا وقتی تاریخچه را پاک نکنی دوباره ظاهر نمی‌شود. زبان و روشنایی هم از انتخاب مرورگرت پیروی می‌کنند؛ می‌توانی با دکمه‌های بالای صفحه دستی هم عوضشان کنی.

`B` دسته‌ای باز می‌کند — ۵، ۱۰، ۲۰ یا ۵۰ تا، هرچه خودت انتخاب کنی. `1` `2` `3` بین صف، فهرست کامل و رسیدگی‌شده‌ها جابه‌جا می‌شوند. هیچ‌کدام از این کلیدها وقتی داخل کادر جست‌وجو تایپ می‌کنی عمل نمی‌کنند.

بار بعد که برمی‌گردی، کارت شروع نام آخرین آرشیوی که خوانده‌ای را یادش هست و همان را نشانت می‌دهد، تا وقت تلف نکنی سر اینکه کدام فایل بود. فقط نام و اندازه و تاریخ فایل ذخیره می‌شود و نه یک سطر از فهرست فالوها؛ و چون مرورگر اجازه نمی‌دهد فایلی را از روی مسیرش دوباره باز کنیم، این یادآوری است نه میان‌بر — همان فایل را باید دوباره انتخاب کنی. خواندنش هم نوار پیشرفت واقعی دارد: عددها از خود خوانندهٔ ZIP می‌آید، نه از یک انیمیشن، پس روی آرشیو چندگیگابایتی معلوم است که کار پیش می‌رود و برنامه گیر نکرده.

روی کامپیوتر، نسخهٔ وب و نسخهٔ دسکتاپ یک تاریخچه دارند: یک فایل، که هر بار قبل از نوشتن دوباره خوانده می‌شود، پس اگر هر دو با هم باز باشند هیچ‌کدام کار دیگری را پاک نمی‌کند. اپ اندروید طبعاً روی گوشی است و تاریخچهٔ خودش را همان‌جا نگه می‌دارد.

### همهٔ کلیدها

| کلید | وب | دسکتاپ |
|---|---|---|
| `Enter` یا `O` | باز کردن و ثبت | باز کردن و ثبت (`O` ندارد) |
| `Space` یا `S` | بعدی | `Space` و `→` |
| `B` | دسته‌ای | دسته‌ای |
| `U` | برگرداندن | برگرداندن (یا `Ctrl+Z`) |
| `1` `2` `3` | صف / فهرست کامل / رسیدگی‌شده | همان |
| — | — | `T` تغییر تم، `Ctrl+O` انتخاب آرشیو، `Esc` بستن پیام |

---

## اجرا

یک برنامه است با سه پوسته: مرورگر، پنجرهٔ دسکتاپ، و اپ اندروید.

پیش‌نیازش یک چیز است: **پایتون ۳.۹ یا بالاتر** از [python.org](https://www.python.org/downloads/) — و در نصب ویندوز تیک «Add python.exe to PATH» را بزن، چون همان یک تیک است که بعداً کم می‌آید. اگر پایتون نصب نباشد، `Run.bat` همین را می‌گوید و می‌گوید از کجا بگیری، به‌جای اینکه با `'python' is not recognized` بسته شود. و اگر پکیج‌های نسخهٔ وب نصب نباشند، خودِ برنامه اسم پکیج و دستور نصبش را می‌نویسد — نه یک traceback.

روی ویندوز ساده‌ترین راه `Run.bat` است: منویی می‌آید و بین نسخهٔ وب، نسخهٔ دسکتاپ، اجرای تست‌ها و ساختن APK اندروید انتخاب می‌کنی. (ساختن APK به پایتون کار ندارد؛ Node و JDK می‌خواهد.)

**نسخهٔ وب** یک سرور کوچک روی `127.0.0.1:8000` بالا می‌آورد و مرورگر را باز می‌کند:

```bash
pip install -r requirements.txt
python x_analyzer_server.py
```

**نسخهٔ دسکتاپ** پنجرهٔ خودش را دارد و به هیچ پکیجی نیاز ندارد جز خودِ پایتون (روی دبیان/اوبونتو `sudo apt install python3-tk` هم لازم است، چون tkinter آنجا بستهٔ جداست):

```bash
python x_follow_analyzer.py
```

نسخهٔ دسکتاپ یک دکمهٔ **خروجی اکسل** هم دارد که فهرست را با یوزرنیم، آیدی و لینک در یک فایل `.xlsx` می‌ریزد. تنها جایی از برنامه است که به `openpyxl` نیاز دارد، و اگر نصب نباشد برنامه crash نمی‌کند؛ همان دستور نصب را نشانت می‌دهد.

**نسخهٔ اندروید** یک APK واقعی است و لازم نیست بسازی‌اش. دو راه برای گرفتنش هست و هر دو یک فایل می‌دهند:

- **[دانلود مستقیم APK](https://github.com/weederace/x-follow-analyzer/releases/latest/download/follow-desk-debug.apk)** — این لینک همیشه به آخرین نسخه اشاره می‌کند، پس می‌توانی همین را در گوشی باز کنی و تمام.
- یا اگر کل پروژه را با **Code → Download ZIP** گرفته‌ای، فایل همان‌جا در `dist/follow-desk-debug.apk` هست. برای همین APK داخل مخزن نگه داشته می‌شود: کسی که فقط اپ گوشی را می‌خواهد نباید مجبور شود صفحهٔ Releases را پیدا کند.

نه Node لازم دارد، نه JDK، نه هیچ چیز دیگری. اندروید می‌پرسد که آیا نصب از این منبع مجاز است — چون فایل با کلید debug امضا شده و از Play Store نمی‌آید؛ برای استفادهٔ شخصی مشکلی ندارد.

اگر ترجیح می‌دهی خودت بسازی — یا چیزی در `web/` عوض کرده‌ای و APK تازه می‌خواهی — روی ویندوز یک دستور است:

```bat
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

خودش JDK را پیدا می‌کند، Android SDK را پیدا یا (با اجازه‌ات) نصب می‌کند، build می‌گیرد و فایل را در `dist\follow-desk-debug.apk` می‌گذارد. یک نکته که واقعاً پیش می‌آید: Gradle 8.2.1 فقط با JDK ۱۷ تا ۲۰ می‌سازد، پس اگر جاوای جدیدتری داری اسکریپت همان اول می‌ایستد و می‌گوید. یکی نصب کن و دوباره بزن:

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

لازم نیست `JAVA_HOME` را عوض کنی؛ اسکریپت خودش می‌گردد و نسخهٔ مناسب را برمی‌دارد، پس جاوای پیش‌فرض سیستم و بقیهٔ پروژه‌هایت دست‌نخورده می‌مانند. جزئیات و مسیر دستی در [ANDROID.md](ANDROID.md) است.

---

## گرفتن آرشیو از X

از `Settings and privacy` → `Your account` → `Download an archive of your data` درخواست بده. X بین چند ساعت تا چند روز آماده‌اش می‌کند و لینک دانلود می‌فرستد. فایل ZIP را **باز نکن و از حالت ZIP درنیاور**؛ همان فایل را به برنامه بده.

آرشیوهای واقعی چند گیگابایتی‌اند، ولی از تمام آن حجم فقط فهرست فالوور و فالویینگ (با هر تعداد فایل `-part`/`_part` و نسخهٔ `.json`) و `account.js` یا `profile.js` برای پیدا کردن یوزرنیم خودت باز می‌شوند. بقیهٔ آرشیو — توییت‌ها، عکس‌ها، دایرکت‌ها — حتی از حالت فشرده درنمی‌آید. برای همین چند ثانیه طول می‌کشد، نه چند دقیقه.

---

## چرا نتیجه با آنچه فکر می‌کنی متفاوت است

X در آرشیو چند فایل دارد که اسمشان شبیه فهرست فالوورهاست ولی فهرست فالوور نیستند: `follower-requests-sent.js` (کسانی که *درخواست* فالو فرستادی)، `follower-requests-received.js`، `following-requests.js`، `smartblock-following.js` و `unfollowed-accounts.js`.

نسخهٔ اول این پروژه هر فایلی که کلمهٔ follower در نامش بود را فهرست فالوور می‌شمرد. نتیجه این می‌شد که هر کسی که فقط درخواست فالو برایش فرستاده بودی، «فالوور» حساب می‌شد، دوطرفه به‌نظر می‌رسید و از نتیجه حذف می‌شد — یعنی دقیقاً حساب‌هایی که دنبالشان بودی. حالا فقط فهرستی از نام‌های دقیق پذیرفته می‌شود، و هر فایلی که نامش شبیه فهرست فالوور بود ولی پذیرفته نشد، در ستون کنار صفحه اسمش می‌آید تا ببینی چه چیزی شمرده نشده.

اگر در فهرست کامل جای یوزرنیم `—` می‌بینی، تقصیر برنامه نیست: بعضی آرشیوها در `userLink` فقط `https://twitter.com/intent/user?user_id=…` دارند و اسم کاربری در فایل نیست. روی کارت، آیدی نمایش داده می‌شود و لینک با همان آیدی ساخته می‌شود، که در X درست باز می‌شود.

---

## تاریخچه کجا ذخیره می‌شود

نه در پوشهٔ پروژه. در پوشهٔ دادهٔ کاربری سیستم:

```
ویندوز :  %LOCALAPPDATA%\XFollowAnalyzer\processed_history.json
مک     :  ~/Library/Application Support/XFollowAnalyzer/processed_history.json
لینوکس :  $XDG_DATA_HOME/x-follow-analyzer/processed_history.json
          (و اگر XDG_DATA_HOME تنظیم نباشد: ~/.local/share/x-follow-analyzer/)
```

دلیلش این است که این فایل فهرست حساب‌هایی است که تو فالو می‌کنی، یعنی دادهٔ خصوصی. تا وقتی داخل پوشهٔ پروژه باشد، یک `git add -f` بی‌حوصله یا زیپ کردن پوشه و فرستادنش برای یک نفر، آن را لو می‌دهد؛ بودن در `.gitignore` تضمین واقعی نیست. در پوشهٔ کاربری، سیستم‌عامل خودش با دسترسی‌های هر حساب از آن محافظت می‌کند و روی لینوکس و مک پوشه `0700` و فایل `0600` می‌شود.

نوشتن اتمیک است (فایل موقت و `os.replace`)، پس قطع برق وسط ذخیره یا پر شدن دیسک، تاریخچهٔ قبلی را خراب نمی‌کند. ورودی هم اعتبارسنجی می‌شود: فقط رشته‌های رقمی با طول معقول و تا سقف مشخص ذخیره می‌شوند، تا یک آرشیو دست‌کاری‌شده نتواند هر چیزی روی دیسک تو بنویسد.

اگر می‌خواهی جای دیگری باشد — مثلاً روی یک درایو رمزگذاری‌شده — متغیر محیطی `XFA_HISTORY_DIR` را تنظیم کن.

اگر نسخهٔ قدیمی‌تر این برنامه را داشتی، `processed_history.json` کنار پروژه‌ات در اولین اجرا خودش به مسیر جدید منتقل می‌شود و چیزی از دست نمی‌رود. فایل قدیمی دست‌نخورده سر جایش می‌ماند؛ فقط دیگر در آن نوشته نمی‌شود.

---

## امنیت نسخهٔ وب

سرور فقط به `127.0.0.1` گوش می‌دهد، ولی این کافی نیست: هر صفحهٔ وبی که در مرورگرت باز باشد می‌تواند به `127.0.0.1:8000` درخواست بفرستد و تاریخچه‌ات را بخواند یا پاک کند. پس هر درخواست به API هدرهای `Host` و `Origin` را بررسی می‌کند و هر چیزی جز مبدأ خودی را رد می‌کند، و برای درخواست‌هایی که چیزی را تغییر می‌دهند `Sec-Fetch-Site` هم بررسی می‌شود تا مرورگرهایی که `Origin` نمی‌فرستند راه فراری نداشته باشند.

آرشیو در حالت معمول هرگز آپلود نمی‌شود؛ ZIP در خودِ صفحه با `DecompressionStream` باز می‌شود. `/api/analyze` فقط برای مرورگرهای قدیمی‌تر است که این API را ندارند، و آنجا هم سقف حجم و بررسی مبدأ برقرار است.

---

## ساختار پروژه

```
x_analyzer_server.py    سرور FastAPI: فایل‌های web/ و API تاریخچه
x_follow_analyzer.py    نسخهٔ دسکتاپ (Tkinter)، بدون وابستگی اضافه
archive_parser.py       خواندن آرشیو و محاسبهٔ یک‌طرفه‌ها — مرجع پایتونی
history_store.py        ذخیره‌سازی مشترک تاریخچه، اتمیک و بیرون از پوشهٔ پروژه
requirements.txt        وابستگی‌های نسخهٔ وب (و openpyxl اختیاری برای اکسل)
Run.bat                 منوی اجرا برای ویندوز

web/index.html          ساختار میز تریاژ
web/app.css             پالت و چیدمان، بدون فریم‌ورک
web/app.js              کنترل‌کنندهٔ برنامه، فارسی/انگلیسی
web/analyzer.js         همان الگوریتم archive_parser.py، در مرورگر
web/zip.js              خوانندهٔ ZIP بدون کتابخانهٔ بیرونی
web/history.js          پل تاریخچه: API سرور، یا حافظهٔ دستگاه در اندروید
web/icon.svg            آیکون برنامه و اپ اندروید
web/manifest.webmanifest  تا نصب روی گوشی و دسکتاپ ممکن باشد

build-apk.ps1           از clone تا APK نصب‌شدنی، با یک دستور
dist/follow-desk-debug.apk  اپ اندروید، آماده برای نصب — تنها فایل باینری مخزن
.github/workflows/      ساخت خودکار APK با هر تگ، و اجرای تست‌ها با هر push
android-res/            آیکون لانچر، صفحهٔ شروع و استایل شب — تنها چیزی در android/ که مال ماست
tools/                  ساخت آیکون‌ها از icon.svg و کپی‌شان در پروژهٔ تولیدشده
package.json            اسکریپت‌های ساخت APK و اجرای تست‌های جاوااسکریپت
capacitor.config.json   تنظیمات بستهٔ اندروید — web/ را مستقیم داخل APK می‌گذارد
ANDROID.md              ساخت APK با Capacitor
LICENSE                 MIT

tests/run_all.py        همهٔ تست‌ها با یک دستور
```

`android/` در `.gitignore` است چون ۲۰۰ مگابایت خروجی Gradle است و با یک دستور
دوباره ساخته می‌شود. ولی `android-res/` نه: هر بار که آن پوشه از نو ساخته شود،
آیکون‌ها باید دوباره سر جایشان بروند، و اگر پیگیری نشوند کسی که پروژه را clone
می‌کند اپ را با لوگوی پیش‌فرض Capacitor می‌سازد.

خودِ APK هم استثناست: `*.apk` نادیده گرفته می‌شود و فقط همین یک فایل نه، تا
**Code → Download ZIP** اپ گوشی را هم با خودش ببرد. عوضش خطر کهنه شدن دارد، پس
`tests/test_android.py` بازش می‌کند و فایل‌های `web/` داخلش را با `web/` واقعی
می‌سنجد؛ اگر رابط عوض شده باشد و APK نه، تست سرخ می‌شود. ساختن نسخهٔ تازه هم دیگر
دست یک کامپیوتر خاص نیست: هر تگ `v*` روی گیت‌هاب build می‌شود و APK به همان Release
می‌چسبد.

هیچ CDN، هیچ فریم‌ورک، هیچ مرحلهٔ build. `web/` همان چیزی است که مرورگر می‌بیند، پس چیزی نیست که از کد اصلی عقب بماند.

---

## تست

```bash
python tests/run_all.py
```

شش مجموعه، بیش از ۴۷۰ بررسی. مهم‌ترینشان `test_analyzer.mjs` است: یک آرشیو می‌سازد و همان بایت‌ها را به هر دو خوانندهٔ پایتونی و جاوااسکریپتی می‌دهد و خروجی‌ها را مقایسه می‌کند، چون دو پیاده‌سازی از یک الگوریتم بی‌صدا از هم دور می‌شوند.

نسخهٔ دسکتاپ با یک tkinter تقلبی (`tests/faketk.py`) و نسخهٔ وب با یک DOM تقلبی (`tests/minidom.mjs`) اجرا می‌شوند — هیچ‌کدام Mock نیستند، بلکه پیاده‌سازی واقعی همان بخش کوچکی هستند که برنامه استفاده می‌کند. تفاوتش این است که Mock به هر اسم غلطی جواب می‌دهد، اینها نه. تست‌ها هرگز به تاریخچهٔ واقعی دست نمی‌زنند؛ `tests/sandbox.py` مسیر ذخیره‌سازی را به یک پوشهٔ موقت می‌برد.

`test_android.py` بدون Android SDK اجرا می‌شود و به‌جای build گرفتن، منابع اپ را بررسی می‌کند: پانزده فایل PNG با اندازهٔ درست در پنج تراکم (با یک خوانندهٔ PNG کوچک از `zlib`، تا هیچ وابستگی اضافه لازم نشود)، رنگ آیکون برابر با پالت `web/app.css`، علامت داخل حاشیهٔ امنی که هیچ لانچری نمی‌بُرد، و اینکه هر مسیری که `android/` را دست می‌زند آیکون‌ها را هم کپی می‌کند. دلیل وجودش این است که این‌ها بی‌صدا خراب می‌شوند: اپ ساخته می‌شود، هیچ خطایی نمی‌دهد، و فقط روی گوشی معلوم می‌شود که آیکونش لوگوی Capacitor است.

همین مجموعه سه فایلی را هم که رنگ میز در آن‌ها کپی شده — manifest، متاهای `theme-color` و `capacitor.config.json` — با `web/app.css` می‌سنجد (رنگ روز از بلوک `:root` و رنگ شب از `[data-theme="dark"]`)، و نمی‌گذارد مستندات چیزی را وعده بدهند که در `package.json` نیست؛ متن فارسی ANDROID.md یک‌بار پلاگینی را تبلیغ می‌کرد که هرگز نصب نشده بود.

اگر Node نصب نباشد، چهار مجموعهٔ پایتونی اجرا می‌شوند و در خلاصه صریح نوشته می‌شود که دو تای دیگر اجرا نشده‌اند — نه اینکه کار نیمه‌تمام موفق گزارش شود. برای اجرای فقط بخش جاوااسکریپت: `npm test`.

---

<h2 id="english">English</h2>

Request your archive from X (`Settings and privacy` → `Your account` → `Download an archive of your data`), then hand the ZIP to whichever version you prefer. Do not unzip it.

```bash
# Python 3.9 or newer. On Windows, tick "Add python.exe to PATH" in the installer.
pip install -r requirements.txt   # fastapi + uvicorn, needed by the web version
python x_analyzer_server.py       # web:     http://127.0.0.1:8000
python x_follow_analyzer.py       # desktop: nothing but Python (openpyxl if you export)
python tests/run_all.py           # all six suites, over 470 checks
```

The Android app does not have to be built, and you do not have to find the Releases page either. [Download the APK directly](https://github.com/weederace/x-follow-analyzer/releases/latest/download/follow-desk-debug.apk) — that link always resolves to the newest release — or, if you took the whole project with **Code → Download ZIP**, the same file is already sitting at `dist/follow-desk-debug.apk`. It is the one binary this repository keeps on purpose: somebody who only wants the phone app should not have to build it or hunt for it. Neither Node nor a JDK is involved, only Android's permission to install a file signed with a debug key rather than one from the Play Store. Building it yourself is for when you have changed something under `web/`.

Every tagged release is built by GitHub rather than on one particular laptop — `.github/workflows/apk.yml` generates the Android project, lays `android-res/` back over Capacitor's template, builds with JDK 17 and attaches the APK under that same fixed name. The copy committed here is a snapshot of the last release, so `tests/test_android.py` unzips it and compares its bundled web assets against `web/`: change the front end without rebuilding and the suite goes red, rather than a stale app shipping to whoever downloads the ZIP.

On Windows, `Run.bat` offers all four of these as a menu, the last being `powershell -ExecutionPolicy Bypass -File build-apk.ps1`, which takes a fresh clone all the way to `dist\follow-desk-debug.apk` — finding a JDK, finding or installing the Android SDK, and writing the `local.properties` Gradle wants. Gradle 8.2.1 builds only with JDK 17 to 20, so on a machine with a newer Java the script stops before the download and names the fix (`winget install EclipseAdoptium.Temurin.17.JDK`) rather than failing four minutes in with `Unsupported class file major version`. [ANDROID.md](ANDROID.md) covers the manual route and every error either path can produce. The desktop version also exports the list to `.xlsx`; that button is the only thing in the project that wants `openpyxl`, and it tells you the install command rather than crashing if it is missing.

Both ways of getting it wrong are answered in words rather than in a stack trace. Run the web version before installing its packages and it names the missing one and prints the command that fixes it, then points at the desktop version, which needs nothing but Python. Run `Run.bat` on a computer with no Python at all and it says so, and where to get it, instead of flashing `'python' is not recognized` and closing.

The interface is a triage desk rather than a dashboard. One account occupies the card at the centre; `Enter` (or `O`) opens the profile in a new tab and records it as handled so it never comes back, `Space` (or `S`) sends it to the back of the queue without recording anything, `U` undoes the last decision, `B` opens the next batch of 5, 10, 20 or 50, and `1` `2` `3` switch between the queue, the full list and everything you have already dealt with. None of them fire while you are typing in the search box. The desktop version adds `→` for next, `T` for the theme, `Ctrl+O` to pick an archive and `Esc` to dismiss a message. The counter above the card drains as you work; totals live in a thin rail where they cannot compete with the decision in front of you.

On first launch a welcome card explains what the X archive is and where to request it; once dismissed it stays away until you erase history. Language and theme follow the browser defaults, and the buttons in the header let you override them. Come back later and the same card names the last archive you read — the file's name, size and date, nothing from the follow list itself. A browser cannot reopen a file from its path, so that is a reminder rather than a shortcut: pick the same ZIP again, and watch a progress bar whose numbers come from the ZIP reader instead of an animation, which is the difference between waiting and wondering on a multi-gigabyte archive.

Everything happens on your device. The ZIP is inflated in the page itself, so nothing is uploaded — `/api/analyze` exists only as a fallback for browsers without `DecompressionStream`. Your review history is stored in the per-user application-data directory (never in the project folder, where a careless `git add -f` would publish it), written atomically, and shared by the web and desktop versions on the same computer; the Android build keeps its own history on the phone. Set `XFA_HISTORY_DIR` to relocate it.

One result worth explaining: X ships several files whose names merely resemble a follower list — `follower-requests-sent.js` above all. Counting those as followers, which the first version of this project did, makes everyone you have only *requested* to follow look mutual and quietly removes them from your results. Only an exact list of filenames is accepted now, and any follower-lookalike that was skipped is named in the rail so you can see what was left out.

MIT licensed — see [LICENSE](LICENSE). Not affiliated with X Corp.
