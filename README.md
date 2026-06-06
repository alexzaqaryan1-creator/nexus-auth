# Nexus

A full-featured social network with real-time messaging, stories, posts, and friend management.

**Live:** [https://nexus-auth-1.onrender.com](https://nexus-auth-1.onrender.com)

## Features

- **Authentication** — Secure registration and login with bcrypt password hashing
- **Friend System** — Send, accept, and decline friend requests with notifications
- **Direct Messages** — 1-on-1 chat with typing indicators and media (images/audio)
- **Group Chats** — Create group conversations with multiple members
- **Stories** — 24-hour expiring content with text overlays, colors, and @mentions
- **Posts** — Permanent feed posts with likes and comments
- **Feed** — Aggregated content from you and your friends

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Database | PostgreSQL |
| Auth | bcryptjs |
| Deployment | Render (backend), GitHub Pages (frontend) |
| CI/CD | GitHub Actions |

## Project Structure

```
nexus-auth/
├── server.js          # Express server and all API routes
├── package.json
├── public/
│   ├── index.html     # Single-page app
│   ├── script.js      # Frontend logic
│   └── style.css      # Styles
└── .github/
    └── workflows/
        └── ci.yml     # GitHub Actions pipeline
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

```bash
git clone https://github.com/alexzaqaryan1-creator/nexus-auth.git
cd nexus-auth
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Option 1 — connection URL
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Option 2 — individual settings
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=nexus_db

# Server
PORT=3000
```

### Run

```bash
npm start
```

The server starts on `http://localhost:3000`. Database tables are created automatically on first run.

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Login |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/search-users/:query` | Search by username or name |

### Friends
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/send-friend-request` | Send friend request |
| POST | `/api/accept-friend-request` | Accept request |
| POST | `/api/decline-friend-request` | Decline request |
| GET | `/api/friends/:user_id` | Get friends list |
| GET | `/api/notifications/:user_id` | Get pending requests |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/send-message` | Send DM |
| GET | `/api/messages/:user1/:user2` | Get conversation |
| GET | `/api/messages/:id/media` | Get message media |
| GET | `/api/unread-count/:user_id` | Unread message count |
| POST | `/api/mark-chat-seen` | Mark messages as read |
| POST | `/api/typing` | Report typing status |
| GET | `/api/typing-status/:my_id/:other_id` | Check typing status |

### Group Chats
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/create-group` | Create group |
| GET | `/api/groups/:user_id` | Get user's groups |
| GET | `/api/group-members/:group_id` | Get members |
| POST | `/api/send-group-message` | Send group message |
| GET | `/api/group-messages/:group_id` | Get group history |

### Stories
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/stories` | Create story |
| GET | `/api/stories/:user_id` | Get stories feed |
| DELETE | `/api/stories/:story_id` | Delete story |
| GET | `/api/stories/:id/media` | Get story media |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/posts` | Create post |
| GET | `/api/feed/:user_id` | Get feed |
| GET | `/api/posts/:id/media` | Get post media |
| POST | `/api/posts/:post_id/like` | Like post |
| DELETE | `/api/posts/:post_id/like` | Unlike post |
| GET | `/api/posts/:post_id/likes` | Get likes |
| POST | `/api/posts/:post_id/comments` | Add comment |
| GET | `/api/posts/:post_id/comments` | Get comments |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test` | Server and DB status |

## Database Schema

Tables are auto-created on startup:

- **users** — accounts and profile info
- **friend_requests** — pending/accepted requests
- **friends** — established friendships
- **messages** — direct messages (supports text, image, audio)
- **group_chats** — group rooms
- **group_members** — group membership
- **group_messages** — group message history
- **stories** — ephemeral content (expires 24h after creation)
- **posts** — permanent feed content
- **post_likes** — post engagement
- **post_comments** — post comments

## Deployment

### Backend (Render)

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables (see above)

### Frontend (GitHub Pages)

The frontend is deployed automatically via GitHub Actions on every push to `main`. The frontend detects the environment and points to the correct backend URL.

## License

MIT
