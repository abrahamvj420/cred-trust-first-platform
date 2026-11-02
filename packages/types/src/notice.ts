import { z } from 'zod';

/**
 * The privacy notice shown right after welcome, before CRED collects anything
 * (Digital Personal Data Protection Act alignment). A change in wording needs a
 * new version: every agreement is logged against the version and language shown.
 */
export const NOTICE_VERSION = '2026-11-v1';

export const NoticeLanguage = z.enum(['en', 'hi']);
export type NoticeLanguage = z.infer<typeof NoticeLanguage>;

export const NoticeItemKey = z.enum(['phone', 'dob', 'name', 'email', 'card', 'credit_score']);

export const NoticeContent = z.object({
  languageLabel: z.string(),
  eyebrow: z.string(),
  title: z.string(),
  summary: z.string(),
  scoreCheck: z.string(),
  itemsTitle: z.string(),
  items: z.array(z.object({ key: NoticeItemKey, label: z.string(), purpose: z.string() })),
  rightsTitle: z.string(),
  rights: z.array(z.object({ title: z.string(), body: z.string() })),
  withdrawTitle: z.string(),
  withdraw: z.string(),
  complainTitle: z.string(),
  complain: z.string(),
  board: z.string(),
  contactTitle: z.string(),
  contact: z.string(),
  later: z.string(),
  agree: z.string(),
  versionLabel: z.string(),
});
export type NoticeContent = z.infer<typeof NoticeContent>;

export const NOTICE: Record<NoticeLanguage, NoticeContent> = {
  en: {
    languageLabel: 'English',
    eyebrow: 'Before you share anything',
    title: 'What CRED collects, and why',
    summary: 'To run your membership, CRED collects your phone number, date of birth, name, email, card details and credit score. We use them only for the purposes listed here, and you can withdraw at any time.',
    scoreCheck: 'We’ll check your credit score with a credit bureau to confirm eligibility.',
    itemsTitle: 'See each item and its purpose',
    items: [
      { key: 'phone', label: 'Phone number', purpose: 'To sign you in with a one-time code, and to find your UPI ID at your bank.' },
      { key: 'dob', label: 'Date of birth', purpose: 'To confirm you’re 18 or over, and to find your record at the credit bureau.' },
      { key: 'name', label: 'Name', purpose: 'To set up your membership and find your record at the credit bureau.' },
      { key: 'email', label: 'Email', purpose: 'To send your statements, receipts and any notices about your membership. Never marketing.' },
      { key: 'card', label: 'Card details', purpose: 'The last 4 digits you enter, then the limit, bills and purchases your bank shares, so you can pay bills and see them here. We also look at big purchases, to tell if a saving is worth asking you about. Never your full card number or CVV.' },
      { key: 'credit_score', label: 'Credit score', purpose: 'To confirm eligibility for membership. We keep the score and the date we checked it.' },
    ],
    rightsTitle: 'Your rights',
    rights: [
      { title: 'Access', body: 'See what CRED holds about you, or download it, in Profile → Privacy.' },
      { title: 'Correction', body: 'Ask us to correct anything that’s wrong or out of date.' },
      { title: 'Erasure', body: 'Ask us to delete your data in Profile → Privacy → Delete my data.' },
      { title: 'Nominate someone', body: 'Name someone to use these rights for you if you’re unable to, through illness or death.' },
    ],
    withdrawTitle: 'If you withdraw your consent',
    withdraw: 'Withdraw at any time in Profile → Privacy → Delete my data. Your membership ends, but existing loans and policies with partners continue.',
    complainTitle: 'If something isn’t right',
    complain: 'Complain to us in Profile → Help and complaints.',
    board: 'You also have the right to complain to the Data Protection Board of India.',
    contactTitle: 'Data protection contact',
    contact: 'Data Protection Officer, CRED · privacy@cred.example',
    later: 'We’ll only ask about personalised savings later, if it can save you money.',
    agree: 'Agree and continue',
    versionLabel: 'Notice version',
  },
  hi: {
    languageLabel: 'हिन्दी',
    eyebrow: 'कुछ भी साझा करने से पहले',
    title: 'CRED क्या जानकारी लेता है, और क्यों',
    summary: 'आपकी सदस्यता चलाने के लिए CRED आपका फ़ोन नंबर, जन्म तिथि, नाम, ईमेल, कार्ड की जानकारी और क्रेडिट स्कोर लेता है। हम इनका उपयोग केवल यहाँ बताए गए उद्देश्यों के लिए करते हैं, और आप कभी भी अपनी सहमति वापस ले सकते हैं।',
    scoreCheck: 'पात्रता की पुष्टि के लिए हम क्रेडिट ब्यूरो से आपका क्रेडिट स्कोर जाँचेंगे।',
    itemsTitle: 'हर जानकारी और उसका उद्देश्य देखें',
    items: [
      { key: 'phone', label: 'फ़ोन नंबर', purpose: 'एक बार के कोड से आपको साइन इन करने और आपके बैंक में आपकी UPI ID ढूँढने के लिए।' },
      { key: 'dob', label: 'जन्म तिथि', purpose: 'यह पुष्टि करने के लिए कि आपकी उम्र 18 वर्ष या अधिक है, और क्रेडिट ब्यूरो में आपका रिकॉर्ड ढूँढने के लिए।' },
      { key: 'name', label: 'नाम', purpose: 'आपकी सदस्यता बनाने और क्रेडिट ब्यूरो में आपका रिकॉर्ड ढूँढने के लिए।' },
      { key: 'email', label: 'ईमेल', purpose: 'आपके स्टेटमेंट, रसीदें और सदस्यता से जुड़ी सूचनाएँ भेजने के लिए। मार्केटिंग के लिए कभी नहीं।' },
      { key: 'card', label: 'कार्ड की जानकारी', purpose: 'आपके दर्ज किए गए आख़िरी 4 अंक, फिर आपके बैंक से मिली लिमिट, बिल और ख़रीदारी, ताकि आप यहाँ बिल देख और चुका सकें। हम बड़ी ख़रीदारी भी देखते हैं, यह जानने के लिए कि क्या कोई बचत आपसे पूछने लायक है। पूरा कार्ड नंबर या CVV कभी नहीं।' },
      { key: 'credit_score', label: 'क्रेडिट स्कोर', purpose: 'सदस्यता की पात्रता की पुष्टि के लिए। हम स्कोर और जाँच की तारीख़ रखते हैं।' },
    ],
    rightsTitle: 'आपके अधिकार',
    rights: [
      { title: 'जानकारी देखना', body: 'Profile → Privacy में देखें या डाउनलोड करें कि CRED के पास आपकी क्या जानकारी है।' },
      { title: 'सुधार', body: 'जो जानकारी ग़लत या पुरानी हो, उसे ठीक करने के लिए हमसे कहें।' },
      { title: 'मिटाना', body: 'Profile → Privacy → Delete my data में अपनी जानकारी मिटाने के लिए कहें।' },
      { title: 'किसी को नामित करना', body: 'बीमारी या मृत्यु की स्थिति में अपनी ओर से इन अधिकारों का उपयोग करने के लिए किसी को नामित करें।' },
    ],
    withdrawTitle: 'अगर आप अपनी सहमति वापस लेते हैं',
    withdraw: 'Profile → Privacy → Delete my data में कभी भी सहमति वापस लें। आपकी सदस्यता समाप्त हो जाएगी, लेकिन पार्टनर के साथ मौजूदा लोन और पॉलिसी जारी रहेंगी।',
    complainTitle: 'अगर कुछ ठीक न लगे',
    complain: 'Profile → Help and complaints में हमसे शिकायत करें।',
    board: 'आपको भारतीय डेटा संरक्षण बोर्ड (Data Protection Board of India) में शिकायत करने का भी अधिकार है।',
    contactTitle: 'डेटा संरक्षण संपर्क',
    contact: 'डेटा संरक्षण अधिकारी, CRED · privacy@cred.example',
    later: 'निजी बचत सुझावों के बारे में हम बाद में तभी पूछेंगे, जब उनसे आपके पैसे बच सकें।',
    agree: 'सहमत हूँ और आगे बढ़ें',
    versionLabel: 'सूचना संस्करण',
  },
};
