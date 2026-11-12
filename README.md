# Meri Dukaan — Cloudflare edition (Part 2)

The same shop app as the Firebase version, running on **Cloudflare** with a **D1** database.
Use it as a back-up: if Firebase hits its free daily limit, this one has far more room.

| | Firebase edition | Cloudflare edition |
|---|---|---|
| Database reads | 50,000 a day | **5,000,000 rows a day** |
| Database writes | 20,000 a day | 100,000 rows a day |
| Where it runs | Vercel | Cloudflare (free) |
| Customer email login | Gmail | Brevo (free, 300 emails a day) |

Everything in the app is the same: expiry batches, invoices and PDFs, customers, brands, tags, Excel import and export, the owner app at `/manage` and the shop at `/`.

---

## Set it up (about 20 minutes, no coding)

### 1. Make a free Cloudflare account
Go to cloudflare.com and sign up. No card is needed.

### 2. Make the database
1. In Cloudflare, open **Storage & databases → D1 SQL database → Create database**.
2. Name it `meri-dukaan` and create it.
3. Copy the **Database ID** (a long code like `3f2a…`).

You do **not** need to create any tables. The app makes them the first time it runs.

### 3. Put the files on GitHub
1. Make a new GitHub repository, for example `meri-dukaan-cloudflare`, and upload all the files from this folder (the zip, unzipped).
2. On GitHub, open `wrangler.toml`, press the pencil (Edit), and replace `PASTE-YOUR-D1-DATABASE-ID-HERE` with the ID you copied. Save (Commit).

### 4. Connect it to Cloudflare
1. Cloudflare → **Workers & Pages → Create → Import a repository** (Connect to Git) → pick your repository.
2. Project name: `meri-dukaan`. Leave the build command empty. The deploy command should be `npx wrangler deploy`.
3. Press **Save and Deploy**. Wait for "Success".

### 5. Add your secret settings
Open the new Worker → **Settings → Variables and secrets → Add**. Choose type **Secret** for each:

| Name | What to put |
|---|---|
| `ADMIN_PASSWORD` | the password you will type to open `/manage` |
| `SESSION_SECRET` | any long random text (30+ letters and numbers). Never change it later, or everyone is logged out |
| `STORE_NAME` | your shop's name (this can be plain text) |

Press **Deploy** after adding them.

### 6. Open your shop
Your address is shown at the top of the Worker, like `https://meri-dukaan.YOURNAME.workers.dev`.
- Customers: that address.
- You: that address followed by `/manage`, then your `ADMIN_PASSWORD`.

---

## Customer email login (optional, free)
Gmail's usual way of sending mail does not work on Cloudflare, so use **Brevo** (free: 300 emails a day). Your Gmail can still be the "from" address.

1. Sign up at brevo.com.
2. **Senders, domains & dedicated IPs → Senders → Add a sender**: your Gmail address and shop name. Brevo emails you a code; confirm it.
3. **SMTP & API → API keys → Generate a new API key**. Copy it.
4. In Cloudflare add two **Secrets**: `BREVO_API_KEY` (the key) and `FROM_EMAIL` written exactly like `My Shop <yourname@gmail.com>`.
5. Press **Deploy**.

---

## How this edition keeps database reads low
- **Indexes.** Every list the app shows (orders newest first, products on the shop, orders by status, tags in order…) has an index, so the database reads only the rows it needs, never the whole table. `npm test` also checks this.
- **One query instead of many.** When the app needs several records at once, they are fetched in a single query.
- **Small changes are one command.** Changing a price or a stock number does not read the record first.
- **Photos are kept at Cloudflare's edge.** A photo is read from the database once. After that it is served from Cloudflare's cache for a year.
- **The shop page is remembered for 30 seconds**, and any change you make clears it at once.
- **The "new orders" check is one tiny read a minute** instead of reloading the order list.

Typical cost (from `node test/efficiency.js`, a shop with 100 products and 300 orders):

| Action | Queries | Rows read |
|---|---|---|
| A customer opens the shop | 4 | 22 |
| The same page again within 30 seconds | 0 | 0 |
| You open the whole backend | 15 | about 530 |
| The "new orders" check | 1 | 1 |
| A customer places an order | 13 | 7 |

The 5 million rows a day is far more than the shop needs. The tighter limit is Cloudflare's free 100,000 requests a day: each shop visit makes a handful of requests, so expect room for roughly 15,000 to 25,000 visits a day.

---

## Free-plan limits to know
- **Workers (free):** 100,000 requests a day, and 10 milliseconds of computer time per request. Normal screens are far below this. If a PDF invoice or the invoices PDF export ever fails with "Error 1102", it is hitting that time limit; the $5 a month Workers plan removes it.
- **D1 (free):** 5 million rows read and 100,000 rows written a day, 500 MB for the database. Photos are stored inside the database (each under 0.5 MB), so about 1,000 photos fit.
- If a limit is reached, the shop shows a clear message and works again after the reset at midnight UTC (5:30 am IST).
- This edition has been tested on a computer with Cloudflare's own local runner, not on a live Cloudflare account. Please try one test order and one invoice PDF first.

## Moving your products from the Firebase edition
In the Firebase app: **Products → upload icon → Export all products** (Excel/CSV). In this app: **Products → upload icon → Import from a file** and choose that file. Brands, tags, prices, stock and expiry come across. Photos do not; add them again.

## For people who want to try it on their own computer
```
npm install
copy .dev.vars.example to .dev.vars and fill it in
npm run dev        # opens at http://localhost:8787
npm test           # needs Node 22.5 or newer and:  npm i --no-save jsdom
```

## Moving your shop from the Firebase edition (products, photos, prices, descriptions, orders)

1. On your **old Firebase website** open `/move`, type your owner password, press **Save shop to a file**. (If it says the daily limit is reached, wait until about 1:30 pm India time and try again.)
2. On your **new Cloudflare website** open `/move`, type the same owner password, pick the saved file, press **Load file into this shop**.
3. Open the shop and the owner app: everything should be there. The owner password is the `ADMIN_PASSWORD` you set on that website.

The Firebase edition needs `server.js` and `public/move.html` uploaded to GitHub for step 1 to exist.
