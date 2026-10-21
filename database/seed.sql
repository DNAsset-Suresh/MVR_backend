-- Only facts supplied in the brief. No invented biography, achievements or dates.
INSERT INTO content_items(kind,title,body,published)
SELECT 'biography','Madurai V. Ramakrishnan','Motivational Speaker | Educationist | Mentor',true
WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE kind='biography');
INSERT INTO site_settings(key,value) VALUES
 ('tagline','"Inspiring Minds. Empowering Education. Transforming Lives."'),
 ('contact_email','""'),('contact_phone','""'),('whatsapp_number','""'),('address','""')
ON CONFLICT(key) DO NOTHING;
