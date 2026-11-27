import type { WaiverConsent, WaiverContent, WaiverDefinition } from './types.js';

/**
 * "Paws N Play: Boarding Consent & Waiver", version 2026-11.
 * Transcribed word for word from the 8-page PDF (punctuation, ₹ amounts and typographic quotes kept).
 * DO NOT EDIT: signed waivers reference this exact text by version + contentHash. Publish a new version instead.
 */
const CONFIRM_ITEMS = [
  'I am the dog’s pet parent, or I am authorised by the pet parent to make decisions about the dog, and I am over 18.',
  'My dog’s vaccinations are up to date and I have shared the record with Paws N Play.',
  'My dog has been dewormed within the last month.',
  'To my knowledge, my dog is free of ticks and fleas and has shown no signs of illness in the past seven days.',
  'My dog is not in heat, and I have told Paws N Play whether my dog is sterilised.',
  'I have told Paws N Play in writing about my dog’s allergies, diet, medication, medical conditions and behaviour, including any history of biting or fighting. The Know Your Dog questionnaire I filled is complete and true, and I will tell Paws N Play if anything changes before a later stay.',
  'I understand that a trial visit is strongly recommended before a first overnight stay. If I choose to skip it, I accept that the first stay may be more stressful for my dog.',
];

const RISKS_INTRO =
  'I understand that kennel-free group boarding carries some risks that cannot be removed completely, even with good care. I accept that:';
const RISK_ITEMS = [
  'my dog may get small scratches, nicks or bruises while playing with other dogs;',
  'infections can pass between dogs in a shared space, such as a cough, a skin or stomach infection, or ticks, even when every dog is vaccinated and the space is kept clean;',
  'my dog may get an upset stomach from eating grass or mud, new food, a change of water or excitement;',
  'my dog may show signs of stress, such as eating less, irregular toilet habits or restlessness;',
  'an existing or age-related condition may flare up during the stay.',
];
const HEAT_RESPONSIBILITY =
  'If I have not disclosed to Paws N Play that my dog is unsterilised or in heat, anything that follows as a result of Paws N Play treating the dog as sterilised / not in heat, including mating, pregnancy or a fight, is my responsibility.';

const VET_AUTHORISATION =
  'I authorise Paws N Play to take my dog to a vet and to approve the treatment the vet considers necessary if I and my emergency contact cannot be reached in time.';

const FINAL_AGREEMENT =
  'I have read and understood Part A and Part B, and I agree to them for this stay and for later stays of the same dog.';

const content: WaiverContent = {
  version: '2026-11',
  title: 'Paws N Play: Boarding Consent & Waiver',
  intro: [
    '**Please read this before your dog’s first stay with us. It takes about five minutes.**',
    'Part A explains how Paws N Play works and what you can expect. Part B is what you confirm and agree to when you sign. Paws N Play is run by Five Tails Collective LLP, called “we” and “us” below.',
  ],
  parts: [
    {
      id: 'how-we-work',
      label: 'Part A',
      title: 'How we work',
      blocks: [
        {
          type: 'paragraph',
          text: 'Paws N Play is run by three founders who came to boarding through animal welfare. Between us, we have hands-on experience running a rescue shelter, caring for and rehabilitating rescued dogs and Indies, and finding them homes through adoption. That is where our way of handling dogs comes from.',
        },
        {
          type: 'card',
          text: '**Kennel-free group boarding.** Dogs live together, not in cages. Each room is shared by about four dogs, and all dogs share the garden. We group dogs by size and temperament.',
          note: 'If you want your dog kept separately, ask when you book, because we can only arrange it in advance.',
        },
        {
          type: 'card',
          text: '**People on site.** Two trained staff members live at the facility and are with the dogs day and night. One of the three founders visits every day, and two live nearby and are available for emergencies. The whole facility is covered by CCTV.',
        },
        {
          type: 'card',
          text: '**Medical cover.** We have a paravet on call. The nearest vet clinic is Companion Care Pet Clinic and Diagnostic at Conscient One, Dwarka Expressway, Sector 109, Gurugram. We do not have a vet on the premises.',
        },
        {
          type: 'card',
          text: '**Food.** Two fresh meals a day of rice and chicken cooked with a seasonal vegetable such as carrot or pumpkin, plus treats through the day.',
          note: 'If your dog needs a special diet, a particular kibble or an extra meal, tell us when you book and send the food with your dog.',
          extra: 'An extra meal is charged at ₹150 per meal.',
        },
        {
          type: 'card',
          text: '**Water.** Dogs drink RO water. Water bowls are shared.',
          note: 'If you want separate water or food bowls for your dog, tell us in advance. The bowls are to be provided by you.',
        },
        {
          type: 'card',
          text: '**Outdoors.** Dogs spend most of the day in the garden. They will nibble some grass and a bit of mud. That is normal.',
        },
        {
          type: 'card',
          text: '**Other boarders.** Some of our boarders are rescue dogs in our care. They meet the same vaccination and deworming standard as every other dog.',
        },
        {
          type: 'card',
          text: '**Updates.** We send several video updates a day. We tell you about any injury, however small.',
        },
        {
          type: 'card',
          text: '**Grooming.** A basic bath and dry is available at ₹750. We do not do haircuts. Please add it when you book.',
        },
      ],
    },
    {
      id: 'before-the-stay',
      label: 'Part A',
      title: 'Before the stay',
      blocks: [
        {
          type: 'card',
          text: '**Trial visit, strongly recommended.** Before a first overnight stay, bring your dog for one visit of 3 to 4 hours so they get to know the space, the staff and the other dogs. Booking ahead leaves time for this. Regular guests don’t need one.',
        },
        {
          type: 'card',
          text: '**Vaccinations.** Your dog’s anti-rabies and combined (7-in-1 or similar) vaccinations must be up to date. Send us a digital copy of the record when you book.',
        },
        {
          type: 'card',
          text: '**Deworming.** Your dog should have been dewormed within the last month, ideally at least a week before the stay. Dogs here are on grass most of the day.',
        },
        {
          type: 'card',
          text: '**Ticks and fleas.** Your dog must be free of ticks and fleas at drop-off. We recommend some form of tick prevention in the last month: a spot-on, a chewable, a tick collar or a tick bath. If your dog has ticks or fleas right now, please wait until they are clear.',
        },
        {
          type: 'card',
          text: '**Heat.** We do not take female dogs who are in heat. Unsterilised dogs, male or female, are welcome, but you must tell us in advance so we can plan their room.',
        },
        {
          type: 'card',
          text: '**Puppies.** We take puppies once their full first course of vaccinations is complete.',
        },
        {
          type: 'card',
          text: '**Recent illness.** If your dog has had a cough, vomiting, loose motions or a skin infection in the past week, tell us before you come.',
        },
        {
          type: 'card',
          text: '**Check at drop-off.** We look over every dog on arrival for ticks, signs of illness and heat. If we find something, we may ask to postpone the stay or do a tick wash first.',
        },
      ],
    },
    {
      id: 'what-to-expect',
      label: 'Part A',
      title: 'What to expect',
      blocks: [
        {
          type: 'paragraph',
          text: 'A new place is a big change for a dog, however comfortable it is and however friendly the other dogs are. These things are common and usually nothing to worry about.',
        },
        {
          type: 'bullets',
          title: 'During the stay',
          items: [
            'Some dogs don’t eat on the first day.',
            'Some dogs don’t poop for the first day or two.',
            'The first night can be an anxious one, which is why the trial visit helps.',
            'Small scratches or nicks can happen during play.',
          ],
        },
        {
          type: 'bullets',
          title: 'After going home',
          items: [
            'Your dog may be very tired and sleep a lot for a day.',
            'A mild stomach upset in the first couple of days is possible, from excitement or a change of water. Keep meals light (for example, curd rice), give plenty of water and add a probiotic such as Enterogermina.',
            'If the stomach upset lasts more than two days, or your dog seems unwell, please see your vet and let us know.',
          ],
        },
      ],
    },
    {
      id: 'what-you-confirm',
      label: 'Part B',
      title: 'What you confirm',
      blocks: [{ type: 'numbered', intro: 'By signing this form, I confirm that:', items: CONFIRM_ITEMS }],
    },
    {
      id: 'risks-you-accept',
      label: 'Part B',
      title: 'Risks you accept',
      blocks: [
        { type: 'bullets', title: RISKS_INTRO, items: RISK_ITEMS },
        { type: 'paragraph', text: HEAT_RESPONSIBILITY },
      ],
    },
    {
      id: 'if-your-dog-needs-a-vet',
      label: 'Part B',
      title: 'If your dog needs a vet',
      blocks: [
        {
          type: 'paragraph',
          text: 'If your dog is unwell or hurt, we take them to our nearby vet clinic right away and call you. Treatment comes first, and the bill gets sorted after. For anything that is not urgent, we call you before we go.',
        },
        { type: 'statement', text: VET_AUTHORISATION },
        {
          type: 'card',
          title: 'We cover the vet bill',
          text: 'if your dog is injured because of a lapse in our care or supervision, including an injury from a fight with another dog at our facility.',
        },
        {
          type: 'card',
          title: 'You cover the vet bill,',
          text: 'at the clinic’s actual charges, if:',
          items: [
            'your dog falls ill, for example an infection, an upset stomach, tick fever or a flare-up of an existing condition. These can happen in any group setting despite our best care;',
            'the problem is linked to something we weren’t told, or were told incorrectly, about your dog’s health, allergies, medication, heat cycle or behaviour;',
            'your dog injures another dog or a person because of behaviour you knew about and didn’t share with us.',
          ],
        },
        {
          type: 'paragraph',
          text: 'When we cover the bill, that means treatment at our clinic, or at another vet we agree on with you, until your dog has recovered from that injury and includes only expenses related to the injury.',
        },
      ],
    },
    {
      id: 'other-things-you-agree-to',
      label: 'Part B',
      title: 'Other things you agree to',
      blocks: [
        {
          type: 'bullets',
          items: [
            '**Safety calls.** If a dog is unsafe around other dogs or people, unwell or too stressed to settle, we may keep them separately or ask you or your emergency contact to collect them.',
            '**Heat during the stay.** If your dog comes into heat while with us, we will keep her separately and ask you or your emergency contact to collect her as soon as possible.',
            '**Emergency contact.** You will give us a contact who can be reached during the stay, can make decisions about your dog and can collect them.',
            '**Pickup.** You will collect your dog on the agreed date. Extra nights are charged at our current rate. If we cannot reach you or your emergency contact for seven days after the agreed pickup date, we may move your dog to other suitable care at your cost.',
            '**Photos and videos.** We may use photos and videos of your dog on our Instagram and WhatsApp. Tell us if you would prefer we didn’t.',
            '**Belongings.** Please label anything you send. We look after it, but in a group setting we cannot be responsible for toys, beds, collars or bowls that get lost or chewed.',
            '**Your details.** We use your contact details and your dog’s records only to care for your dog and to stay in touch with you.',
            '**Payment and cancellation.** These follow our rate card and booking terms, shared separately.',
          ],
        },
        {
          type: 'rates',
          title: 'Stays beyond your booking',
          text: 'Any time your dog stays beyond what you have booked and paid for is charged as per our rate card. For example:',
          items: [
            { price: '₹400', label: 'Half day, up to 4 hours' },
            { price: '₹750', label: 'Full day of daycare, up to 9 hours' },
          ],
        },
      ],
    },
    {
      id: 'commitment-and-signature',
      label: null,
      title: 'Our commitment and your signature',
      blocks: [
        {
          type: 'card',
          text: 'We built Paws N Play to be the place we would trust with our own dogs. For every hour your dog is with us, their safety, comfort and happiness are our responsibility, and nothing in this form changes that. We will care for them like family and keep you honestly updated all the way through.',
        },
        { type: 'statement', text: FINAL_AGREEMENT },
        { type: 'paragraph', text: 'Thank you for trusting us with your dog. We can’t wait to meet them.' },
      ],
    },
  ],
};

const SHORT_CONFIRM = [
  'I am the pet parent (or authorised) and over 18',
  'Vaccinations are up to date and shared',
  'Dewormed within the last month',
  'Free of ticks, fleas and illness',
  'Not in heat, sterilisation status shared',
  'Allergies, diet, medication and behaviour shared',
  'Trial visit recommendation understood',
];

/**
 * Checkboxes. Labels are the PDF text; the acceptOtherTerms label is the only wording not printed in the PDF
 * (the PDF has no checkbox for that section) - legal review recommended.
 */
const consents: WaiverConsent[] = [
  ...CONFIRM_ITEMS.map((label, i) => ({
    key: `confirm${i + 1}`,
    label,
    shortLabel: SHORT_CONFIRM[i] as string,
    required: true,
  })),
  {
    key: 'acceptRisks',
    label: [RISKS_INTRO, ...RISK_ITEMS.map((item) => `• ${item}`), HEAT_RESPONSIBILITY].join('\n'),
    shortLabel: 'I accept the risks of group boarding',
    required: true,
  },
  {
    key: 'vetAuthorisation',
    label: VET_AUTHORISATION,
    shortLabel: 'I authorise vet treatment if you can’t reach me',
    required: true,
  },
  {
    key: 'acceptOtherTerms',
    label: 'I agree to “Other things you agree to”, including “Stays beyond your booking”.',
    shortLabel: 'I agree to the other things listed',
    required: true,
  },
  {
    key: 'finalAgreement',
    label: FINAL_AGREEMENT,
    shortLabel: 'I have read and agree to Part A and Part B',
    required: true,
  },
  {
    key: 'photosOptOut',
    label: 'I’d prefer you didn’t use photos or videos of my dog on Instagram or WhatsApp.',
    shortLabel: 'No photos or videos on social media',
    required: false,
  },
];

export const WAIVER_2026_11: WaiverDefinition = { content, consents };
