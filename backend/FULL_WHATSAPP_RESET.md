# Fresh WhatsApp block

Close WhatsApp Web on all connected computers before resetting, so an open extension cannot save cached leads back during the reset.

Run the existing offline reset with both `--confirm-whatsapp-only --all-whatsapp-block`. Full-block mode clears non-social rows in crm_contacts, crm_chats and crm_messages, including legacy malformed IDs. Social identifiers containing Instagram, LinkedIn or Facebook remain protected. Cold Calls lives in its own untouched table. All other tables, including archives, are preserved. SQLite and fallback JSON are backed up first; protected rows are checked before committing.

After restarting, refresh the CRM and inspect `/api/chats` if rows remain. Browser caches or another connected extension may repopulate the dashboard; do not assume a screenshot proves the reset failed. Extension storage is not cleared. Restore leads individually after confirming the active WhatsApp block is empty.

# AI-agent removal

The unused backend AI-agent service and the standalone ai-agent source directory have been removed. Incoming WhatsApp messages remain stored and broadcast without automatic AI replies. Manual messaging and WhatsApp connection remain available.

On production, run `pm2 delete ai-agent` followed by `pm2 save` to remove the independently managed process from the saved PM2 process list. Removing Git files does not stop an already-running process. These removed files can be recovered from Git history; existing databases and secrets were not deleted.
