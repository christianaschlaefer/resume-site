# The automatic thank-you email

Everything in this folder controls the email a visitor gets after they leave
their details. Edit it right on GitHub — Vercel redeploys on its own.

## thank-you.txt — the words
- The first line, `Subject: ...`, is the subject line.
- Write the body like a normal email. A blank line starts a new paragraph.
- `{{site}}` becomes your site's address.
- `{{video}}` becomes a line with your walkthrough link once
  WALKTHROUGH_VIDEO_URL is set in Vercel, and simply disappears until then.
- Web addresses you type become links automatically.
- There's deliberately no placeholder for the visitor's name or company:
  echoing what a visitor typed into an email sent to an address they typed
  lets spammers use your Gmail to deliver their messages.

## PDFs — the attachments
- Every PDF in this folder is attached (up to 10 MB each).
- To update one, upload the new version (same name, or delete the old one).
- To stop attaching, delete it.
- The file name is what recipients see, so make it readable.

If thank-you.txt is ever missing or empty, the built-in wording is used and
the email still goes out.
