# Live Reviews — Setup Guide

> **Note (July 2026):** the site now has a full online shop. The Firebase config
> moved to [js/config.js](js/config.js), and the complete security rules
> (including the review rules below, plus shop/admin rules) live in
> [firestore.rules](firestore.rules). For everything shop-related see
> **[DOCUMENTATION.md](DOCUMENTATION.md)** — this file remains as background on
> how the reviews feature works.

The site has a **Community Reviews** section (`#reviews`) where anyone can post a
star rating + review and see it appear instantly. It runs on **Firebase Firestore**,
which works on static hosting like GitHub Pages and is free for this scale.

## One-time setup (~10 minutes)

### 1. Create a Firebase project
- Go to https://console.firebase.google.com → **Add project**
- Name it (e.g. `geodor-reviews`). You can skip Google Analytics.

### 2. Create the database
- Left menu → **Build → Firestore Database → Create database**
- Choose a location near your customers, start in **Production mode**.

### 3. Register a web app & copy the config
- Project Overview → click the **`</>`** (web) icon → register an app
- Copy the `firebaseConfig` object it shows you.

### 4. Paste the config into the code
- Open [js/reviews.js](js/reviews.js) and replace the placeholder
  `firebaseConfig` (the `YOUR_...` values) with the one you copied.

### 5. Add the security rules
In Firestore → **Rules** tab, paste this and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reviews/{id} {
      // anyone can read reviews
      allow read: if true;

      // anyone can create one, but the shape is validated
      allow create: if request.resource.data.keys().hasOnly(['name','rating','message','createdAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 40
        && request.resource.data.rating is int
        && request.resource.data.rating >= 1
        && request.resource.data.rating <= 5
        && request.resource.data.message is string
        && request.resource.data.message.size() >= 3
        && request.resource.data.message.size() <= 500;

      // reviews can't be edited or deleted from the public site
      allow update, delete: if false;
    }
  }
}
```

### 6. Push to GitHub
```bash
git add -A
git commit -m "Add live reviews"
git push origin main
```
The section goes live at https://geodorlimited.github.io within a minute or two.

## How it works
- **Posting:** the form writes one document to the `reviews` collection
  (`name`, `rating`, `message`, `createdAt`). The rules above validate it.
- **Real time:** `onSnapshot` keeps an open connection — when any visitor posts,
  every open browser re-renders the list within ~1 second, no refresh needed.
- **Display:** reviews show newest-first with an average-rating summary on top.

## Good to know
- The `apiKey` in the config is **safe to commit** — it's a public identifier,
  not a secret. Your Firestore rules are what actually protect the data.
- **Moderation / spam:** anyone can post. To remove a bad review, delete the
  document in the Firestore console. For higher volume, consider adding Firebase
  App Check (reCAPTCHA) or requiring anonymous auth + a per-user rate limit.
- **Free tier limits:** 50K reads / 20K writes per day — far beyond what a
  storefront of this size will hit.
