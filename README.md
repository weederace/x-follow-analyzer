# 𝕏 Follow Analyzer — Pro Max UI 🚀

**A powerful, privacy-focused, and completely offline desktop application for analyzing your X (formerly Twitter) data archive.**

**𝕏 Follow Analyzer** analyzes your official X data archive locally and shows you exactly which accounts you follow that **do not follow you back** — without requiring access to your X account, API keys, passwords, cookies, or third-party services.

**𝕏 Follow Analyzer** یک برنامه قدرتمند، امن و کاملاً آفلاین است که آرشیو رسمی اطلاعات حساب X شما را به‌صورت محلی بررسی می‌کند و دقیقاً نشان می‌دهد چه افرادی را فالو کرده‌اید اما شما را فالو بک نکرده‌اند؛ بدون نیاز به دسترسی مستقیم به حساب، API Key، رمز عبور، کوکی یا سرویس شخص ثالث.

---

![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)
![Tailwind CSS](https://img.shields.io/badge/Frontend-Tailwind_CSS-38B2AC.svg)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Offline-brightgreen.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

---

## ✨ Overview / معرفی پروژه

### English

X provides users with an archive containing information from their account. This archive can contain follower and following data that can be used to analyze your social connections.

𝕏 Follow Analyzer takes this archive, processes the relevant data locally, compares your followers with the accounts you follow, and generates an easy-to-use dashboard.

The application is designed around **privacy, simplicity, and speed**.

You don't need to:

* Log in to X through the application
* Provide your X password
* Provide API credentials
* Export browser cookies
* Connect your X account
* Upload your archive to a remote server

Simply provide your downloaded X archive and let the application do the analysis locally.

### فارسی

X امکان دریافت آرشیو اطلاعات حساب را در اختیار کاربران قرار می‌دهد. این آرشیو می‌تواند شامل اطلاعات مربوط به Followers و Following باشد.

𝕏 Follow Analyzer فایل آرشیو را دریافت کرده، اطلاعات موردنیاز را به‌صورت محلی پردازش می‌کند، لیست Followers و Following را با یکدیگر مقایسه می‌کند و نتیجه را در قالب یک داشبورد حرفه‌ای نمایش می‌دهد.

تمرکز اصلی پروژه روی **حریم خصوصی، سرعت و سادگی استفاده** است.

برای استفاده از برنامه نیازی به موارد زیر ندارید:

* ورود به حساب X داخل برنامه
* رمز عبور X
* API Key
* Cookie مرورگر
* اتصال مستقیم حساب X
* آپلود آرشیو روی سرور خارجی

فقط آرشیو دانلودشده از X را انتخاب کنید و تحلیل را به‌صورت محلی انجام دهید.

---

# 🌟 Features / امکانات

## 🔒 100% Offline & Privacy-Focused / کاملاً آفلاین و حریم‌خصوصی‌محور

### English

Privacy is one of the main goals of this project.

The archive is processed locally on your own computer through a local FastAPI server. The application does not require an external backend or cloud storage.

Your archive remains on your machine during the analysis process.

### فارسی

حریم خصوصی یکی از اصلی‌ترین اهداف این پروژه است.

آرشیو X روی کامپیوتر خودتان و توسط یک FastAPI server محلی پردازش می‌شود و برای تحلیل نیازی به سرور خارجی یا فضای ابری ندارید.

اطلاعات آرشیو در طول فرآیند تحلیل از سیستم شما خارج نمی‌شود.

### Privacy Features

* 🔒 Local processing / پردازش کاملاً محلی
* 🔑 No API Key / بدون API Key
* 🔐 No password / بدون رمز عبور
* 🍪 No browser cookies / بدون Cookie مرورگر
* ☁️ No cloud upload / بدون آپلود ابری
* 🌐 No third-party analysis service / بدون سرویس تحلیل شخص ثالث
* 👤 No X account login / بدون ورود به حساب X

> **Privacy Note:** The application itself is designed to process the archive locally. As with any local application, network activity may still depend on your operating system, browser, or other software running on your machine.

---

# 🎨 Pro Max UI / رابط کاربری حرفه‌ای

The application includes a modern browser-based dashboard with a dark **Midnight Web3 / Glassmorphism** visual style.

برنامه دارای یک داشبورد مدرن و ریسپانسیو با طراحی **Midnight Web3 / Glassmorphism** است.

### UI Highlights / امکانات رابط کاربری

* 🌙 Modern dark interface
* 🌍 English / فارسی bilingual interface
* 📱 Responsive mobile-friendly layout
* 🍔 Responsive drawer navigation
* 📊 Interactive charts
* ⚡ Fast profile actions
* 🧊 Glassmorphism cards
* 🎯 Clear account statistics
* 🔄 Processed / Unprocessed workflow

---

# 📊 Advanced Analytics / تحلیل پیشرفته

After analyzing your archive, the dashboard provides useful statistics about your account.

پس از تحلیل آرشیو، داشبورد آمار مختلفی از وضعیت Followers و Following نمایش می‌دهد.

### Available Statistics

| Metric                        | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| 👥 Followers                  | تعداد افرادی که شما را دنبال می‌کنند                  |
| ➡️ Following                  | تعداد افرادی که شما دنبال می‌کنید                     |
| 🤝 Mutuals                    | تعداد دنبال‌کننده‌های دوطرفه                          |
| ❌ Not Following Back          | افرادی که شما دنبال می‌کنید اما شما را دنبال نمی‌کنند |
| 🎯 Follow-back Rate           | درصد افرادی که Follow Back کرده‌اند                   |
| ⚖️ Follower / Following Ratio | نسبت Followers به Following                           |

---

# 📈 Interactive Charts / نمودارهای تعاملی

The dashboard visualizes your account data using interactive charts.

داشبورد اطلاعات حساب را به‌صورت نمودارهای تعاملی نمایش می‌دهد.

### Charts

* 🍩 **Connections Distribution**

  * Followers
  * Following
  * Mutual Connections
  * Not Following Back

* 📊 **Account Balance**

  * Followers vs. Following

* 🎯 **Follow-back Rate**

  * Percentage of accounts following you back

این نمودارها باعث می‌شوند وضعیت ارتباطات حساب بدون نیاز به بررسی دستی هزاران Username قابل مشاهده باشد.

---

# 🧠 Smart Processing History / تاریخچه هوشمند

One of the main features of the application is its **Processed Profiles** system.

برنامه پروفایل‌هایی را که قبلاً بررسی کرده‌اید با استفاده از `localStorage` مرورگر به خاطر می‌سپارد.

When you open a profile:

1. The X profile opens in a new browser tab.
2. The username is marked as processed.
3. The profile is moved to the **Processed** section.
4. The status is saved locally in your browser.

در نتیجه، اگر تعداد زیادی حساب برای بررسی داشته باشید، دیگر لازم نیست یک پروفایل را چند بار بررسی کنید.

### Benefits / مزایا

* ✅ Prevents duplicate checking
* ✅ Keeps your workflow organized
* ✅ Survives browser refreshes
* ✅ Requires no database
* ✅ Stored locally in the browser

> Clearing your browser's site data or `localStorage` may remove the processed history.

---

# ⚡ Batch Profile Opening / باز کردن گروهی پروفایل‌ها

The application allows you to open multiple profiles with a single action.

می‌توانید چند پروفایل را به‌صورت گروهی در مرورگر باز کنید.

این قابلیت برای زمانی که تعداد زیادی **Not Following Back** دارید بسیار کاربردی است.

### Example

Instead of opening profiles one by one:

```text
Profile 01 → Open
Profile 02 → Open
Profile 03 → Open
Profile 04 → Open
...
```

You can process multiple profiles together using the batch action.

> The exact number of profiles opened at once may depend on browser settings and popup/tab restrictions.

---

# 🆔 Automatic Account Detection / تشخیص خودکار حساب

The application attempts to detect the owner account information from the X archive automatically.

برنامه اطلاعات مربوط به صاحب آرشیو را از فایل‌های موجود در آرشیو استخراج کرده و در داشبورد نمایش می‌دهد.

This allows the interface to display the analyzed account without requiring manual username input.

---

# 🗂️ Archive Processing / پردازش آرشیو

The application works with the official X account archive downloaded by the user.

The archive is typically provided as a ZIP file.

The application extracts and processes the relevant account data required for follower/following analysis.

Depending on the archive format provided by X, relevant files may include files such as:

```text
account.js
profile.js
follower.js
following.js
```

> **Important:** X may change its archive structure or filenames over time. The application should therefore be considered dependent on the structure of the archive provided by X.

### فارسی

برنامه با آرشیو رسمی X که توسط کاربر دانلود شده کار می‌کند.

این آرشیو معمولاً به‌صورت فایل ZIP ارائه می‌شود و برنامه اطلاعات موردنیاز برای تحلیل Followers و Following را از آن استخراج می‌کند.

فایل‌های مورد استفاده ممکن است شامل موارد زیر باشند:

```text
account.js
profile.js
follower.js
following.js
```

ساختار آرشیو X ممکن است در نسخه‌های مختلف تغییر کند.

---

# ⚙️ Requirements / پیش‌نیازها

Before installing the project, make sure you have:

قبل از نصب پروژه مطمئن شوید موارد زیر را دارید:

* Python **3.8 or newer**
* Git
* A modern web browser
* An X data archive in ZIP format

Recommended browsers:

* Google Chrome
* Microsoft Edge
* Mozilla Firefox
* Brave

---

# 📦 Installation / نصب

## 1. Install Python / نصب Python

Install Python 3.8 or newer.

Download Python from the official Python website.

> On Windows, make sure **"Add Python to PATH"** is enabled during installation.

بر روی ویندوز هنگام نصب Python گزینه **Add Python to PATH** را فعال کنید.

---

## 2. Clone the Repository / دریافت پروژه

Clone the repository using Git:

```bash
git clone https://github.com/weederace/x-follow-analyzer.git
cd x-follow-analyzer
```

یا در صورت استفاده از ZIP، پروژه را مستقیماً از GitHub دانلود و Extract کنید.

---

## 3. Install Dependencies / نصب پیش‌نیازها

Install the required Python packages:

```bash
pip install fastapi uvicorn python-multipart
```

اگر سیستم شما از چند نسخه Python استفاده می‌کند، می‌توانید از این دستور استفاده کنید:

```bash
python -m pip install fastapi uvicorn python-multipart
```

در برخی سیستم‌ها ممکن است لازم باشد از `python3` استفاده کنید:

```bash
python3 -m pip install fastapi uvicorn python-multipart
```

---

# 📥 Getting Your X Archive / دریافت آرشیو X

## English

Before using the application, you need to request your X data archive.

### Steps

1. Open **X**.
2. Go to **Settings and privacy**.
3. Open **Your account**.
4. Select **Download an archive of your data**.
5. Verify your identity if requested.
6. Submit the archive request.
7. Wait until X prepares your archive.
8. Download the ZIP file.
9. Keep the ZIP file somewhere on your computer.

### فارسی

قبل از استفاده از برنامه باید آرشیو اطلاعات حساب X خود را دریافت کنید.

### مراحل

1. وارد **X** شوید.
2. وارد **Settings and privacy** شوید.
3. بخش **Your account** را باز کنید.
4. گزینه **Download an archive of your data** را انتخاب کنید.
5. در صورت درخواست، هویت خود را تأیید کنید.
6. درخواست دریافت آرشیو را ثبت کنید.
7. منتظر آماده شدن آرشیو بمانید.
8. فایل ZIP را دانلود کنید.
9. فایل ZIP را روی کامپیوتر خود نگه دارید.

> **Do not extract the ZIP manually unless the application specifically requires it.**

---

# 🚀 Running the Application / اجرای برنامه

After installing the dependencies, start the local server:

```bash
python x_analyzer_server.py
```

The application should start a local FastAPI server and make the dashboard available at:

```text
http://127.0.0.1:8000
```

در صورت پیاده‌سازی قابلیت باز شدن خودکار مرورگر، برنامه می‌تواند مرورگر پیش‌فرض سیستم را نیز به‌صورت خودکار باز کند.

### Local Server

```text
Host: 127.0.0.1
Port: 8000
```

> `127.0.0.1` means the service is bound to the local machine rather than being publicly hosted.

---

# 📂 How to Use / نحوه استفاده

## Step 1 — Select X Archive

Click:

**📂 Select X Archive**

and select the ZIP archive downloaded from X.

### فارسی

روی گزینه:

**📂 انتخاب X Archive**

کلیک کنید و فایل ZIP آرشیو X را انتخاب کنید.

---

## Step 2 — Analyze Your Account

The application reads the required archive data and compares:

```text
Followers
      ↓
Following
      ↓
Comparison
      ↓
Mutuals / Not Following Back
```

پس از پایان پردازش، نتایج و آمار در داشبورد نمایش داده می‌شوند.

---

## Step 3 — Review Not Following Back

Open the section containing accounts that don't follow you back.

You can then inspect the usernames and open their X profiles directly.

---

## Step 4 — Process Profiles

When you open a profile:

```text
Open Profile
     ↓
Mark as Processed
     ↓
Move to Processed List
     ↓
Save locally
```

این سیستم کمک می‌کند وضعیت بررسی حساب‌ها را مدیریت کنید.

---

# 🔐 Privacy & Security / حریم خصوصی و امنیت

## Local Processing / پردازش محلی

All archive analysis is performed locally on your computer.

تمام تحلیل آرشیو روی کامپیوتر خودتان انجام می‌شود.

The application does not require you to upload your archive to a remote analysis service.

برنامه برای تحلیل آرشیو نیازی به آپلود فایل شما روی یک سرویس تحلیل خارجی ندارد.

---

## No X Login / بدون ورود به X

The application does not need your X credentials.

```text
❌ X Password
❌ X API Key
❌ Browser Cookies
❌ Authentication Tokens
❌ Login Session
```

---

## Sensitive Data / اطلاعات حساس

The application is focused on the follower/following information required for analysis.

It does not intentionally require or request:

* 🔑 X password
* 🍪 Browser authentication cookies
* 🔐 Authentication tokens
* 💬 Direct Message access
* 🔑 API credentials

> The application only processes the data necessary for its functionality.

---

# 🛡️ Security Model / مدل امنیتی

The application follows a simple architecture:

```text
┌───────────────────────────┐
│       X Data Archive      │
│          ZIP File         │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│    Local Python Server    │
│          FastAPI          │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│       Data Analysis       │
│ Followers vs Following    │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│     Web Dashboard UI      │
│    Charts + User Lists    │
└───────────────────────────┘
```

No cloud database is required for the core analysis workflow.

---

# 📁 Project Structure / ساختار پروژه

A typical project structure looks like:

```text
x-follow-analyzer/
│
├── x_analyzer_server.py
├── README.md
├── requirements.txt
│
├── static/
│   ├── index.html
│   ├── css/
│   └── js/
│
└── assets/
    └── ...
```

> The exact structure may change between versions.

---

# 🧩 Technology Stack / تکنولوژی‌های استفاده‌شده

| Technology              | Purpose                   |
| ----------------------- | ------------------------- |
| 🐍 Python               | Core application logic    |
| ⚡ FastAPI               | Local backend/server      |
| 🚀 Uvicorn              | ASGI server               |
| 🎨 Tailwind CSS         | UI styling                |
| 📊 Chart.js             | Interactive charts        |
| 🌐 HTML / JavaScript    | Dashboard interface       |
| 💾 Browser localStorage | Processed profile history |

---

# 🔄 How the Analysis Works / نحوه تحلیل

The core concept is simple:

```text
Following
    │
    ├───────────────┐
    │               │
    ▼               ▼
Followers        Not Followers
    │               │
    ▼               ▼
Mutuals        Not Following Back
```

More technically:

```text
Not Following Back = Following − Followers
```

And:

```text
Mutuals = Following ∩ Followers
```

این روش باعث می‌شود برنامه بتواند حساب‌هایی را که شما دنبال می‌کنید اما در لیست Followers شما وجود ندارند، شناسایی کند.

---

# ⚡ Performance / عملکرد

The application is designed to process the relevant archive data locally without requiring a remote API request for every username.

This makes the analysis suitable for large follower/following lists while keeping the workflow simple.

عملیات اصلی تحلیل به‌صورت محلی انجام می‌شود و برای بررسی هر Username نیازی به ارسال درخواست API به X وجود ندارد.

---

# 🐛 Troubleshooting / رفع مشکلات

## `python` command not found

Try:

```bash
python3 --version
```

or on Windows:

```bash
py --version
```

---

## `pip` command not found

Try:

```bash
python -m pip --version
```

Then install dependencies using:

```bash
python -m pip install fastapi uvicorn python-multipart
```

---

## Port 8000 is already in use

If another application is using port `8000`, stop that application or configure the server to use another available port.

---

## Archive is not detected

Make sure:

* The selected file is the original X archive.
* The archive is a valid `.zip` file.
* The archive has not been modified or corrupted.
* The archive was generated by X.
* The archive structure is supported by the current application version.

---

## Some users are missing

X may change its archive format or the structure of follower/following files.

If you encounter unexpected results, verify the archive structure and open an issue on GitHub with the relevant error information.

**Never upload or publish your private X archive publicly.**

---

# 🤝 Contributing / مشارکت در پروژه

Contributions are welcome! 🎉

از Pull Request، Bug Report و Feature Request استقبال می‌کنیم.

### Contribution Workflow

1. Fork the project.
2. Create a feature branch.
3. Make your changes.
4. Test the application locally.
5. Commit your changes.
6. Push your branch.
7. Open a Pull Request.

Example:

```bash
git checkout -b feature/AmazingFeature
git add .
git commit -m "Add AmazingFeature"
git push origin feature/AmazingFeature
```

Then open a Pull Request on GitHub.

---

# 🐞 Bug Reports / گزارش باگ

If you find a bug, please provide:

* Operating system
* Python version
* Application version/commit
* Error message
* Steps to reproduce the issue
* Relevant screenshots if applicable

### ⚠️ Privacy Warning

**Never upload your complete X archive to a public GitHub issue.**

Your archive may contain private and sensitive information.

---

# 💡 Future Plans / برنامه‌های آینده

The following features are planned or may be considered for future versions:

* [ ] 📊 Export results to Excel (`.xlsx`)
* [ ] 📄 Export results to CSV
* [ ] 🔎 Advanced username search
* [ ] 🏷️ User filtering and categorization
* [ ] 📈 More advanced analytics
* [ ] 🔄 Archive comparison / Time Machine
* [ ] 📅 Historical follower analysis
* [ ] 🧹 Improved profile management workflow
* [ ] 🌍 Improved multilingual support
* [ ] 🎨 Additional UI themes
* [ ] ⚙️ Configurable batch size
* [ ] 📱 Improved mobile interface
* [ ] 📦 Standalone executable builds
* [ ] 📝 Detailed analysis reports

> Automatic unfollow functionality should be implemented carefully and may require browser automation or official X functionality.

---

# 🗺️ Roadmap / نقشه راه

### Phase 1 — Core Analyzer

* [x] X archive loading
* [x] Followers extraction
* [x] Following extraction
* [x] Follow-back analysis
* [x] Local processing
* [x] Web dashboard

### Phase 2 — UI & Workflow

* [x] Modern UI
* [x] Responsive layout
* [x] Profile opening
* [x] Processed profile tracking
* [x] Interactive charts
* [x] Bilingual interface

### Phase 3 — Analytics

* [ ] Advanced filtering
* [ ] Search
* [ ] Archive comparison
* [ ] Historical statistics
* [ ] Export system

### Phase 4 — Distribution

* [ ] Windows executable
* [ ] Portable version
* [ ] Improved installation experience
* [ ] Automated dependency management

---

# ⚖️ Disclaimer / سلب مسئولیت

### English

𝕏 Follow Analyzer is an independent, unofficial open-source project.

This project is **not affiliated with, endorsed by, sponsored by, or officially connected to X Corp., Twitter, or any of their subsidiaries or affiliates.

X and Twitter are trademarks of their respective owners.

The application is intended for analyzing data that has been legitimately downloaded by the account owner.

Users are responsible for complying with the applicable laws, regulations, and X Terms of Service when using this software.

### فارسی

𝕏 Follow Analyzer یک پروژه مستقل و غیررسمی است.

این پروژه هیچ‌گونه ارتباط، تأیید، حمایت مالی یا وابستگی رسمی به **X Corp.، Twitter** یا شرکت‌های وابسته به آن‌ها ندارد.

نام‌ها و علائم تجاری X و Twitter متعلق به صاحبان مربوطه هستند.

این برنامه برای تحلیل اطلاعاتی طراحی شده است که کاربر به‌صورت قانونی از حساب خود دریافت کرده است.

مسئولیت استفاده از این نرم‌افزار و رعایت قوانین و شرایط استفاده از X بر عهده کاربر است.

---

# 📜 License / مجوز

This project is licensed under the **MIT License**.

این پروژه تحت مجوز **MIT License** منتشر شده است.

You are free to:

* Use the software
* Modify the source code
* Distribute copies
* Use it commercially

Subject to the conditions of the MIT License.

---

# ❤️ Built for Privacy & the Web3 Community

Built with:

**Python 🐍 · FastAPI ⚡ · Tailwind CSS 🎨 · Chart.js 📊 · Privacy 🔒**

ساخته‌شده با:

**Python 🐍 · FastAPI ⚡ · Tailwind CSS 🎨 · Chart.js 📊 · حفظ حریم خصوصی 🔒**

---

## ⭐ Support the Project

If you find **𝕏 Follow Analyzer** useful:

* ⭐ Star the repository
* 🐛 Report bugs
* 💡 Suggest features
* 🔧 Submit Pull Requests
* 📢 Share the project with others

Your support helps the project grow.

---

## 👨‍💻 Author

**weederace**

Built with ❤️ for people who want to analyze their X connections without giving their account credentials to third-party services.

---

# 🔗 Project

**𝕏 Follow Analyzer — Pro Max UI**

A privacy-focused, local-first X archive analyzer built with Python and FastAPI.

**Analyze locally. Stay private. Know who follows you back. 🔒**
