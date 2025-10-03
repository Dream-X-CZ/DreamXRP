DreamXRP

## Konfigurace e-mailových pozvánek

Pro odesílání e-mailových pozvánek je nutné nasadit Supabase Edge Function `send-invite-email` a nastavit následující proměnné prostředí:

- `RESEND_API_KEY` – API klíč poskytovatele Resend pro odesílání e-mailů.
- `INVITES_FROM_EMAIL` – (volitelné) adresa odesílatele, která se zobrazí příjemcům. Pokud není nastavena, použije se výchozí `DreamXRP <no-reply@dreamxrp.app>`.

Po nasazení funkce se pozvánky vytvořené v Team Settings automaticky odešlou na zadanou e-mailovou adresu.
