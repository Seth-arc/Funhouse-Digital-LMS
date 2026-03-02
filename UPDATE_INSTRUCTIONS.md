# Update Instructions

To see the new features (Schools, Teachers, Parents management), you need to:

## 1. Restart the Server

Stop the current server (Ctrl+C) and restart it:
```bash
cd server
npm run dev
```

## 2. Reinitialize the Database

The database schema has been updated with new tables. You have two options:

### Option A: Delete and Recreate (Recommended for Development)
```bash
# Stop the server first, then:
cd server
# Delete the database file
Remove-Item data\lms.db -ErrorAction SilentlyContinue
# Restart the server - it will recreate the database with new schema
npm run dev
```

### Option B: Keep Existing Data
The database will automatically create new tables when the server starts, but existing data will remain.

## 3. Refresh Your Browser

After restarting the server, refresh your browser (Ctrl+F5 for hard refresh) to see:
- **Schools** section - Add and manage schools
- **Teachers** section - Add and manage teacher accounts
- **Parents** section - Add and manage parent accounts
- **Games** - Now with "Enable Progress Tracking" checkbox
- **Student View** button - Click to see the learner dashboard

## New Features Available:

✅ **Add Schools** - Manage educational institutions
✅ **Add Teachers** - Create teacher accounts with school assignment
✅ **Add Parents** - Create parent accounts with school assignment  
✅ **Game Tracking Toggle** - Enable/disable progress tracking per game
✅ **Student View Access** - Direct link to learner dashboard from student table

All sections appear in the Tutor Dashboard after the welcome message and before the stats cards.
