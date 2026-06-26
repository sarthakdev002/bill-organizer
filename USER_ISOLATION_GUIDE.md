# User Isolation Setup Guide

This guide will help you set up user-specific bill isolation so that each user can only see and manage their own bills.

## Step 1: Apply Database Changes

First, you need to apply the SQL migration to your Supabase database:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/bills_user_isolation.sql`
4. Run the SQL commands

This will:
- Add a `user_id` column to the bills table
- Set up Row Level Security (RLS) policies
- Create indexes for better performance

## Step 2: Update Frontend Code
- Ensure users can only access their own bills

The frontend code has been updated to:

1. **Save bills with user association** (`app/(tabs)/index.tsx`):
   - Now includes `user_id` when inserting new bills
   - Ensures only authenticated users can save bills

2. **Filter bills by current user** (`app/categories/index.tsx`):
   - Only retrieves bills belonging to the current user
   - Uses `.eq('user_id', session.user.id)` filter

3. **Category-specific filtering** (`app/categories/[id].tsx`):
   - Filters bills by both category AND user_id
   - Ensures users only see their own bills in each category
   - Updated delete function to verify ownership

## Step 3: Test the Implementation

1. **Create multiple user accounts**:
   - Sign up with different email addresses
   - Verify each account if email confirmation is enabled

2. **Test bill isolation**:
   - Login as User A and upload some bills
   - Login as User B and upload different bills
   - Verify that each user only sees their own bills

3. **Test cross-user access**:
   - Try to access bills from different users (should fail due to RLS)
   - Verify delete operations only work on own bills

## Step 4: Security Benefits

With these changes:
- **Data isolation**: Each user can only access their own bills
- **Automatic filtering**: No need to manually filter data in frontend
- **Database-level security**: RLS policies enforce security at the database level
- **Performance**: Indexes ensure fast queries even with many users

## Troubleshooting

### Bills not showing up?
- Check that the SQL migration was applied successfully
- Verify the user is authenticated (`session.user.id` exists)
- Check browser console for any Supabase errors

### Permission errors?
- Ensure RLS policies are enabled on the bills table
- Verify the user_id column has proper foreign key constraints
- Check that the user is properly authenticated

### Performance issues?
- Verify that indexes were created successfully
- Check query execution plans in Supabase dashboard
- Consider adding additional indexes if needed

## Code Changes Summary

The key changes made:

1. **Database Schema**: Added user_id to bills table with proper constraints
2. **RLS Policies**: Implemented row-level security for user isolation
3. **Frontend Filtering**: Updated all bill queries to filter by current user
4. **Authentication Checks**: Added proper authentication validation

This implementation ensures complete user isolation where each user can only see and manage their own uploaded bills.