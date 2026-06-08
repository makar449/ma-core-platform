# GitHub Pages demo deploy — no Docker, no Vercel

This is the path for sharing the platform UI with a friend through a GitHub link.

## 1. Push to GitHub

```powershell
git init
git add .
git commit -m "Deploy MA Core institutional demo"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ma-core-platform.git
git push -u origin main
```

## 2. Enable GitHub Pages

Open your repository in GitHub:

```text
Settings → Pages → Source → GitHub Actions
```

## 3. Wait for Actions

Open:

```text
Actions → Deploy static demo to GitHub Pages
```

The workflow builds the static Next.js export from `apps/web` in demo mode.

## 4. Share the link

```text
https://YOUR_USERNAME.github.io/ma-core-platform/
```

## If the link is blank

Check the Actions logs. Most common causes:

- GitHub Pages is not set to GitHub Actions.
- Repository name does not match the generated base path.
- The workflow did not finish.

## Demo boundary

This link is for product preview only. It does not connect to real exchanges and it does not execute orders.
