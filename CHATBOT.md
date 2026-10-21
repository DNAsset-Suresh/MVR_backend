# Ask MVR Assistant

The assistant uses vanilla JavaScript, Express and PostgreSQL. It uses **no external AI model** and requires no AI key. Responses are deterministic and grounded in published content; this avoids invented biography, programmes, availability or achievements.

The API reads published biography, programmes, speaking topics, trust information or matching FAQs. Questions containing a valid ISO date (`YYYY-MM-DD`) query actual future availability and return only public status/time information. Unsupported questions receive a clear fallback with links to the team, booking form, calendar, topics, programmes and Trust.

“Prepare an enquiry” collects event type, city, audience count, language, venue, organisation, contact name and phone. After confirmation, the server validates the draft and the browser temporarily stores it in sessionStorage. Opening the booking form consumes/removes the draft, prefills those details, and requires selection of a published date/time plus final review. The chatbot never directly creates or confirms a booking.

Anonymous chat session tokens are HttpOnly cookies, stored as hashes. Messages are kept in PostgreSQL for up to thirty days. The widget asks visitors not to share passwords or sensitive information. Booking drafts are not written into public content or used as knowledge. Closing the chat returns keyboard focus to the launcher; Escape also closes it.

To maintain answers, use the appropriate CMS section and publish approved information. Draft content and all internal booking/availability notes are excluded. If adding an external model later, keep its key on the backend, retrieve approved knowledge server-side, enforce the same permissions and validate model output before showing it.
