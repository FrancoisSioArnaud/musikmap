# Domain glossary

## Box
A music box / location context where users can discover or deposit songs.

## Box session
A session proving that a user has opened a given box context. Some actions require an active box session.

## Song
A normalized song record stored by the application. Songs may carry provider metadata, artwork, accent color, and cross-provider links.

## Deposit
A shared song instance created by a user.

Deposit types in the project:
- `box`: normal deposit in a box
- `pinned`: temporary pinned song in a box
- `favorite`: song pinned on a user profile

## Main deposit
The currently featured / most recent deposit in a box flow.

## Older deposits
Earlier box deposits shown below the main one in Discover or related views.

## Pinned deposit / pinned song
A deposit of type `pinned` attached to a box for a limited duration and cost.

## Favorite song
A deposit of type `favorite` attached to a user profile.

## DiscoveredSong
A record that a user discovered a deposit through a specific context.

Typical discovery types / contexts used in the product include:
- main box discovery
- revealed deposit discovery
- profile discovery
- link discovery

## Reveal
Action that uncovers a hidden song in a box flow, generally against points and according to backend rules.

## Points
Internal product currency.

Important rule:
- backend is the source of truth for points balance, points gains, and points spending rules

## Emoji
A reaction type users can use on deposits. Some emojis are free, others require unlocking/purchase rights.

## EmojiRight
A right indicating that a user owns / can use a given emoji.

## Reaction
A user reaction attached to a deposit, typically via an emoji.

## Comment
A user comment attached to a deposit, with moderation and anti-abuse rules.

## Comment report
A user or moderation signal indicating a problematic comment.

## Comment moderation decision
A moderation outcome applied to a comment or report flow.

## Link
A shareable link that exposes a specific discovered deposit flow.

## Sticker
A QR / short-link support object attached to a box and used for real-world access / install flows.

## Client
A business/admin-level entity used for theming, content, admin tools, stickers, and articles.

## Article
A content item attached to a client, shown in product surfaces such as Discover and client admin.

## Guest user
A temporary / limited user state used before a full account is finalized.

## Full user
A regular authenticated user with the full capabilities allowed by backend rules.

## Provider
An external music provider integration such as Spotify or Deezer.

## Provider link
A normalized cross-provider link associated with a song.
