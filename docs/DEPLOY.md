# Deploying ICA

This takes about 30 minutes the first time. You need a GitHub, Supabase and Vercel account, and an
Anthropic API key. **Never paste keys into chat or commit them.** They only go into the Supabase,
GitHub and Vercel settings pages named below.

## 0. Merge the pull requests

Vercel deploys the `main` branch, and the database workflow only appears once it is on `main`.
Merge the open pull requests in order, oldest first (#1, then #2, and so on), using
**Create a merge commit** (not squash, which makes the later, stacked PRs conflict). After each
merge, press **Delete branch** on that PR: GitHub then moves the next PR onto `main` by itself. Wait for its checks to go green, then merge it.

## 1. Create the Supabase project (Sydney)

1. In the Supabase dashboard choose **New project**.
2. Name it `ica-demo`, set a strong **database password** (save it in your password manager), and set the region to **Asia-Pacific (Sydney)**.
3. When it is ready, open **Project Settings → General** and copy the **Project ID** (a short code like `abcdxyzabcdxyz`).
4. Open **Project Settings → API Keys** and keep the page open. You need the **anon / publishable** key and the **service_role / secret** key. The service_role key is a secret: it bypasses all security rules.
5. Open your **Account → Access Tokens** page and create a token called `github-deploy`.

## 2. Add the database secrets to GitHub

In the `ica` repository: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Name                        | Value                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`      | The Project ID from step 1.3                                |
| `SUPABASE_DB_PASSWORD`      | The database password from step 1.2                         |
| `SUPABASE_ACCESS_TOKEN`     | The access token from step 1.5                              |
| `SUPABASE_SERVICE_ROLE_KEY` | The service_role / secret key                               |
| `DEMO_STAFF_PASSWORD`       | A new password (12+ characters) for the demo staff accounts |

## 3. Set up the database

1. In the repository open **Actions → Deploy database → Run workflow**.
2. Tick **Reset and load the demo tenant** and choose **Run workflow**.
3. It takes 2 to 3 minutes. A green tick means the tables, security rules, photo storage and demo plant are in place.

Run it again (without the tick) whenever new migrations are merged.

## 4. Deploy the app on Vercel

1. In Vercel choose **Add New → Project**, import the `ica` repository, and keep the Next.js defaults.
2. Before deploying, open **Environment Variables** and add these for Production (and Preview if you like):

| Name                            | Value                                                   |
| ------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<Project ID>.supabase.co`                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon / publishable key                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | The service_role / secret key                           |
| `ANTHROPIC_API_KEY`             | Your Anthropic API key                                  |
| `DEMO_STAFF_PASSWORD`           | Same as in GitHub (used by the Reset demo button)       |
| `DEMO_FAST_TIMERS`              | `true` for demos (a 15-minute dwell runs in 15 seconds) |
| `RESEND_API_KEY`                | Optional: emails you each demo request                  |
| `DEMO_REQUEST_NOTIFY_EMAIL`     | Optional: where those emails go                         |

3. Choose **Deploy**. The functions run in Sydney (`vercel.json`), next to the database.
4. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to your Vercel address (for example `https://ica-xyz.vercel.app`).

## 5. Check it works

1. Open the Vercel address: the landing page loads. Submit a test demo request.
2. Open `/app` and sign in as `admin@demo.ica.test` with your `DEMO_STAFF_PASSWORD`.
3. On the phone, open the same address, sign in as the admin, and register the device. Cleaner PINs are 1111 to 4444.
4. Supervisor: `supervisor@demo.ica.test`. QA: `qa@demo.ica.test`. Same password.
5. Add the site to the phone's home screen so it opens full screen and works offline.

## Before each demo

Sign in as the admin and use **Reset demo** on the admin home page (type RESET). It reloads tonight's
shift. Everyone is signed out and the phone needs registering again, so do it before you start.

## 6. Blockchain anchoring (optional, Base Sepolia test network)

Cleans are sealed and batched without this. These steps make each night's batch get anchored on
the Base Sepolia **test network**, so records show "Verified ✓". Test ETH has no value. Moving to
Base mainnet is a separate, later step (docs/AUDIT_TRAIL.md). **Never paste the private key into
chat or commit it.** It only goes into the GitHub and Vercel secret settings.

1. **Create a dedicated wallet** used only for anchoring. In a wallet app (for example Coinbase
   Wallet or MetaMask) add a new account, then export its private key (starts with `0x`). Keep it
   in your password manager.
2. **Get test ETH**: open a Base Sepolia faucet (search "Base Sepolia faucet"; Coinbase's developer
   platform has one) and send a small amount to the wallet's address. 0.01 test ETH lasts years.
3. **Add the key to GitHub**: repository **Settings → Secrets and variables → Actions → New
   repository secret**, name `ANCHOR_PRIVATE_KEY`.
4. **Deploy the contract**: **Actions → Deploy anchor contract → Run workflow**. When it goes green,
   open the run: its summary shows the contract address.
5. **Add these in Vercel** (Settings → Environment Variables, Production), then redeploy:

| Name                      | Value                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| `ANCHOR_PRIVATE_KEY`      | The same private key                                                 |
| `ANCHOR_CONTRACT_ADDRESS` | The address from step 4                                              |
| `CRON_SECRET`             | A long random string (Vercel sends it to the nightly job)            |
| `ANCHOR_ALERT_EMAIL`      | Optional: where failure and low-balance alerts go (needs Resend key) |
| `PUBLIC_SITE_URL`         | Optional: your public address, used in audit pack QR codes           |

6. **Check it**: sign in as the admin, open **Record seals**, and press **Seal and anchor now**. The
   batch should show `anchored` with a transaction link. The job then runs by itself every night at
   00:15 Australian Eastern Standard Time.
7. Optional: verify the contract's source on Basescan (open the contract address, **Contract →
   Verify and publish**, Solidity single file, the compiler version and settings printed by the
   workflow, source from `contracts/ICAAnchor.sol`).
