// ============================================
//  GEODOR FASHION — Shared configuration
//  One place for every setting you may need to touch.
//  Full instructions: DOCUMENTATION.md
// ============================================

// Firebase web config — safe to commit (it identifies the project,
// it is not a secret; Firestore rules protect the data).
export const firebaseConfig = {
  apiKey: "AIzaSyDuRS0s-vZsutbzJ0yL2e5ooQMt_9PoFcM",
  authDomain: "geodor-reviews-23b8d.firebaseapp.com",
  projectId: "geodor-reviews-23b8d",
  storageBucket: "geodor-reviews-23b8d.firebasestorage.app",
  messagingSenderId: "864726090759",
  appId: "1:864726090759:web:93e0acf1276b9a32f356a2"
};

export const SHOP = {
  // URL of your deployed checkout Cloudflare Worker.
  // Leave "" until you finish DOCUMENTATION.md → "Payments (Stripe)".
  // Example: "https://geodor-checkout.your-subdomain.workers.dev"
  checkoutEndpoint: "geodor-checkout.amoakovera14.workers.dev",

  // Display currency symbol. The actual charge currency is set in the
  // worker (CURRENCY variable) — keep the two consistent.
  currencySymbol: "£",

  // Shown as a note in the cart. The real free-shipping rule is
  // enforced by the worker (FREE_SHIPPING_THRESHOLD variable).
  freeShippingThreshold: 150,

  // Product categories shown as filter tabs on the shop page and as
  // options in the admin panel. key = stored value, label = displayed.
  categories: [
    { key: "avant-garde", label: "Avant-Garde" },
    { key: "minimalist",  label: "Minimalist"  },
    { key: "streetwear",  label: "Streetwear"  },
    { key: "couture",     label: "Couture"     }
  ]
};

export function formatPrice(amount) {
  return SHOP.currencySymbol + Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}
