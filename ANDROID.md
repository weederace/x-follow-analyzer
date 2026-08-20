# ساخت اپ اندروید (APK)

نسخهٔ اندروید همان فایل‌های پوشهٔ `web/` است که داخل یک WebView بومی اجرا می‌شوند —
بدون هیچ باندلر و بدون هیچ مرحلهٔ build میانی. پس چیزی که روی دسکتاپ تست می‌کنید
بایت‌به‌بایت همان چیزی است که در APK اجرا می‌شود.

مهم‌تر از همه: **اپ اندروید کاملاً آفلاین است.** آرشیو ZIP در خود گوشی خوانده
می‌شود (`analyzer.js`)، تاریخچهٔ بررسی‌شده‌ها در حافظهٔ خود اپ می‌ماند
(`history.js`)، و اپ هیچ درخواست شبکه‌ای از خودش نمی‌فرستد. مجوز اینترنت هم لازم
نیست جز برای باز کردن پروفایل در مرورگر یا اپ X.

---

## چه چیزی لازم دارید (یک‌بار)

این ابزارها روی همان کامپیوتری که build می‌کنید نصب می‌شوند، نه روی گوشی:

| ابزار | نسخه | از کجا |
|---|---|---|
| Node.js | ۲۰ یا بالاتر | <https://nodejs.org> |
| JDK | ۱۷ (نه بالاتر) | JDK همراه Android Studio کافی است |
| Android Studio | نسخهٔ فعلی | <https://developer.android.com/studio> |

هنگام نصب Android Studio، در بخش SDK Manager این دو مورد را هم انتخاب کنید:
«Android SDK Platform 34» و «Android SDK Build-Tools».

بعد از نصب، متغیر محیطی `ANDROID_HOME` را روی پوشهٔ SDK تنظیم کنید (معمولاً
`C:\Users\<نام‌شما>\AppData\Local\Android\Sdk`).

---

## ساخت APK

در ریشهٔ پروژه، یک‌بار:

```bat
npm install
npm run android:init
```

`android:init` پوشهٔ `android/` را می‌سازد. این پوشه در `.gitignore` هست چون
حدود ۲۰۰ مگابایت خروجی تولیدشدهٔ Gradle است — هر وقت لازم شد با همین دستور
دوباره ساخته می‌شود.

بعد، هر بار که چیزی در `web/` تغییر داد:

```bat
npm run android:apk
```

روی لینوکس یا مک به‌جای آن `npm run android:apk:unix`.

فایل خروجی اینجاست:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

این فایل را روی گوشی کپی کنید و بازش کنید. اندروید می‌پرسد که نصب از منبع
ناشناس را اجازه می‌دهید یا نه — چون این APK با کلید debug امضا شده و از
Play Store نیامده. برای استفادهٔ خودتان کافی است.

اگر خواستید داخل Android Studio کار کنید (برای دیدن لاگ‌ها یا اجرا روی
شبیه‌ساز):

```bat
npm run android:open
```

---

## آرشیو X را چطور روی گوشی بیاورید

آرشیو را باید از سایت X درخواست کنید — روی گوشی هم می‌شود، ولی راحت‌تر است
روی کامپیوتر بگیرید و بعد منتقل کنید:

1. در X: Settings → Your account → Download an archive of your data
2. X یک ایمیل با لینک دانلود می‌فرستد (معمولاً ۲۴ ساعت بعد)
3. فایل ZIP را دانلود کنید — **بازش نکنید و از حالت ZIP درنیاورید**
4. ZIP را به گوشی منتقل کنید: با کابل USB، یا Telegram Saved Messages، یا
   Google Drive، یا هر روشی که راحت‌تر است
5. در اپ روی «انتخاب فایل آرشیو» بزنید و همان ZIP را انتخاب کنید

فایل ZIP آرشیو معمولاً بین ۵۰ مگابایت تا چند گیگابایت است (بستگی به تعداد
عکس‌ها و ویدیوهایتان دارد). اپ از داخلش فقط فهرست فالوور و فالویینگ و فایل
`account.js` را باز می‌کند و بقیه را حتی از حالت فشرده درنمی‌آورد — پس حتی
آرشیوهای بزرگ هم سریع پردازش می‌شوند.

---

## تفاوت‌های نسخهٔ گوشی

سه چیز عمداً روی گوشی حذف شده‌اند، چون روی موبایل معنا نمی‌دهند:

**باز کردن گروهی چند پروفایل.** روی گوشی `window.open` آدرس را به سیستم تحویل
می‌دهد، پس ۱۰ لینک یعنی ۱۰ بار پرش بین اپ‌ها و گم شدن صف زیر انبوهی از
صفحه‌های X. روی گوشی هر بار یک کارت — که خودش شکل درست کار روی موبایل است.

**میان‌برهای کیبورد.** راهنمای کلیدها نمایش داده نمی‌شود چون کیبوردی نیست.
(اگر کیبورد بلوتوث وصل کنید کلیدها هنوز کار می‌کنند، فقط راهنمایشان پیدا نیست.)

**تاریخچهٔ مشترک با دسکتاپ.** روی گوشی تاریخچه در حافظهٔ خود اپ می‌ماند و با
نسخهٔ دسکتاپ یکی نمی‌شود. اگر روی کامپیوتر ۲۰۰ نفر را بررسی کرده‌اید، روی
گوشی از صفر شروع می‌کنید. (همگام‌سازی یعنی فرستادن داده به یک سرور، و کل
منطق این پروژه این است که هیچ‌چیز از دستگاه شما بیرون نرود.)

---

## اگر build شکست خورد

### `SDK location not found`

پیام کامل چیزی شبیه این است:

```
> SDK location not found. Define a valid SDK location with an ANDROID_HOME
  environment variable or by setting the sdk.dir path in your project's
  local properties file at 'D:\...\android\local.properties'.
```

معنایش این است که Node و Gradle و JDK سالم‌اند و کار تا آخرین قدم پیش رفته؛
فقط Gradle نمی‌داند Android SDK کجاست. دو حالت دارد.

**حالت اول: SDK نصب است ولی `ANDROID_HOME` تنظیم نشده.** این دستور را در
PowerShell و در ریشهٔ پروژه اجرا کنید. خودش SDK را پیدا می‌کند و مسیرش را
می‌نویسد:

```powershell
$sdk = @("$env:ANDROID_HOME", "$env:ANDROID_SDK_ROOT",
         "$env:LOCALAPPDATA\Android\Sdk", "C:\Android\Sdk") |
       Where-Object { $_ -and (Test-Path "$_\platform-tools") } |
       Select-Object -First 1
if ($sdk) {
  "sdk.dir=" + ($sdk -replace '\\','/') | Set-Content -Encoding ASCII android\local.properties
  "پیدا شد: $sdk  — حالا دوباره npm run android:apk را بزنید"
} else {
  "SDK نصب نیست. سراغ حالت دوم بروید."
}
```

`local.properties` در `.gitignore` هست، چون مسیر دیسک شخصی شما را نگه می‌دارد
و روی کامپیوتر کسی دیگر بی‌معنا است.

**حالت دوم: SDK نصب نیست.** لازم نیست کل Android Studio (چند گیگابایت) را نصب
کنید؛ اگر فقط APK می‌خواهید و به IDE کاری ندارید، ابزارهای خط فرمان کافی‌اند —
حدود ۱۵۰ مگابایت. از <https://developer.android.com/studio#command-line-tools-only>
فایل `commandlinetools-win-*.zip` را بگیرید و:

```powershell
mkdir C:\Android\Sdk\cmdline-tools\latest
# محتوای زیپ را داخل همین پوشهٔ latest باز کنید (طوری که bin\sdkmanager.bat دیده شود)
cd C:\Android\Sdk\cmdline-tools\latest\bin
.\sdkmanager.bat "platform-tools" "platforms;android-34" "build-tools;34.0.0"
[Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android\Sdk', 'User')
```

بعد PowerShell را ببندید و باز کنید (تا متغیر محیطی خوانده شود) و دوباره
`npm run android:apk` را اجرا کنید.

نسخهٔ ۳۴ اتفاقی نیست: پروژهٔ تولیدشده `compileSdk 34` و `targetSdk 34` می‌خواهد
و `minSdk 22` است، یعنی اپ روی اندروید ۵.۱ و بالاتر نصب می‌شود.

### `Unsupported class file major version` یا خطای Kotlin/Gradle

یعنی JDK شما جدیدتر از آن است که Capacitor 6 و Gradle 8.2 انتظار دارند. JDK 17
نصب کنید و همان را به Gradle نشان دهید:

```powershell
[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-17', 'User')
```

### اولین build کند است

دفعهٔ اول Gradle خودش را (حدود ۱۵۰ مگابایت) دانلود می‌کند و چند دقیقه طول
می‌کشد — در لاگ `Downloading https://services.gradle.org/...` را می‌بینید. این
یک‌بار است؛ build های بعدی چند ده ثانیه‌اند.

---

## اگر خواستید APK امضاشده بسازید

فقط در صورتی لازم است که بخواهید اپ را به دیگران بدهید یا در Play Store
منتشر کنید. یک کلید بسازید:

```bat
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

بعد `android/keystore.properties` را بسازید:

```properties
storeFile=../my-release-key.jks
storePassword=<رمز شما>
keyAlias=upload
keyPassword=<رمز شما>
```

`*.jks`، `*.keystore` و `keystore.properties` همه در `.gitignore` هستند و
**هرگز نباید commit شوند** — اگر کلید امضا لو برود، هر کسی می‌تواند به نام
شما آپدیت منتشر کند.
