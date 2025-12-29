# GitHub Setup Instructions

## Quick Start

After creating a repository on GitHub, run these commands (replace `YOUR_USERNAME` with your GitHub username):

```bash
# Add the remote repository
git remote add origin https://github.com/IlyaVolvo/Ping-Pong-Tournament-Management-System.git

# Push your code to GitHub
git push -u origin main
```

## Alternative: Using SSH (if you have SSH keys set up)

```bash
# Add the remote repository using SSH
git remote add origin git@github.com:YOUR_USERNAME/pingpong.git

# Push your code to GitHub
git push -u origin main
```

## Future Workflow

### Making Changes
```bash
# 1. Make your code changes
# 2. Stage your changes
git add .

# 3. Commit with a descriptive message
git commit -m "Description of your changes"

# 4. Push to GitHub
git push
```

### Checking Status
```bash
# See what files have changed
git status

# See the actual changes
git diff
```

### Viewing History
```bash
# See commit history
git log

# See a compact view
git log --oneline
```

## Important Notes

- **Never commit `.env` files** - They contain sensitive information (database passwords, JWT secrets)
- **Always commit `env.example`** - This shows what environment variables are needed
- **Commit frequently** - Small, frequent commits are better than large, infrequent ones
- **Write clear commit messages** - Describe what changed and why

## Branching (Optional, for advanced workflows)

```bash
# Create a new branch for a feature
git checkout -b feature-name

# Make changes and commit
git add .
git commit -m "Add new feature"

# Push the branch to GitHub
git push -u origin feature-name

# Later, merge back to main
git checkout main
git merge feature-name
```

