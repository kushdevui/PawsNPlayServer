import { z } from 'zod';
import { isObjectId } from '../../utils/objectId.js';
import { QUESTIONNAIRE_STATUSES } from './questionnaires.model.js';

/**
 * Answers sent by web/know-your-dog/index.html as a JSON string in the `answers` field.
 * Only these keys are kept (unknown keys are dropped). Keys are listed in form order so the first
 * problem reported is the first one on the page. Max lengths follow the page's `maxlength` (cap 2000).
 */
const CHECK = 'Please check your answers and try again.';

const text = (max: number) =>
  z
    .string({ invalid_type_error: CHECK })
    .trim()
    .max(max, `Please keep answers under ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredText = (message: string, max: number) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .max(max, `Please keep answers under ${max} characters.`);

const phone = (message: string) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .regex(/^[0-9+\- ]{7,20}$/, message);

const choice = <T extends [string, ...string[]]>(values: T, message: string) =>
  z.enum(values, { errorMap: () => ({ message }) });

const yesNo = (message: string) => choice(['yes', 'no'], message).optional();

const date = z
  .string({ invalid_type_error: CHECK })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please pick dates with the date picker.')
  .optional();

/** "With other dogs and with people" rows on the page. */
export const SOCIAL_KEYS = [
  'biggerDogs',
  'smallerDogs',
  'maleDogs',
  'femaleDogs',
  'puppies',
  'newPeople',
  'men',
  'women',
] as const;

const social: Record<string, z.ZodTypeAny> = {};
for (const key of SOCIAL_KEYS) {
  social[`with_${key}`] = choice(['fine', 'unsure', 'not_okay'], CHECK).optional();
  social[`with_${key}_note`] = text(300);
}

export const answersSchema = z.object({
  ownerName: requiredText('Please enter your name.', 100),
  ownerPhone: phone('Please enter a valid phone number for you.'),
  address: text(500),
  emergencyName: requiredText('Please add an emergency contact name.', 100),
  emergencyPhone: phone('Please enter a valid emergency contact phone number.'),
  dogName: requiredText("Please enter your dog's name.", 60),
  breed: requiredText("Please enter your dog's breed.", 60),
  age: requiredText("Please enter your dog's age.", 40),
  weight: text(40),
  sex: choice(['male', 'female'], "Please choose your dog's sex."),
  sterilised: choice(['yes', 'no'], 'Please tell us if your dog is sterilised.'),
  heatInfo: text(500),
  rabiesDate: date,
  comboVaccineDate: date,
  dewormingDate: date,
  tickFlea: text(200),
  skinIssues: text(300),
  recentIllness: text(300),
  conditions: text(1000),
  medication: text(1000),
  allergies: text(300),
  vet: text(200),
  homeDiet: text(500),
  standardMealOk: yesNo(CHECK),
  specialFood: text(500),
  extraMeal: yesNo(CHECK),
  avoidFoods: text(300),
  ownBowls: yesNo(CHECK),
  eatingStyle: text(300),
  ...social,
  breedsDislike: text(300),
  fightHistory: text(1000),
  biteHistory: text(1000),
  boardingBefore: text(1000),
  foodGuarding: text(300),
  toyGuarding: text(300),
  placeGuarding: text(300),
  noiseFear: text(300),
  aloneBehaviour: text(300),
  handlingDislikes: text(300),
  escapeRisk: text(300),
  barking: text(300),
  eatsObjects: text(300),
  calmingTips: text(300),
  sleep: text(200),
  toilet: text(300),
  exercise: text(200),
  bath: yesNo(CHECK),
  anythingElse: text(2000),
  confirmTrue: z.literal(true, { errorMap: () => ({ message: 'Please confirm that your answers are true.' }) }),
  signName: requiredText('Please type your name to sign.', 100),
  signDate: date,
});

/** Validated answers with empty optional fields removed (Mixed field in Mongo). */
export type Answers = Record<string, string | boolean>;

/** GET /questionnaires (admin, staff). Unknown params are ignored. */
export const listQuestionnairesQuery = z
  .object({
    status: z.enum(QUESTIONNAIRE_STATUSES, { errorMap: () => ({ message: 'Invalid status.' }) }).optional(),
    search: z.string().trim().max(100, 'Search is too long.').optional(),
  })
  .passthrough();
export type ListQuestionnairesQuery = z.infer<typeof listQuestionnairesQuery>;

/** PATCH /questionnaires/:id (admin): status and the dog it belongs to (null unlinks). */
export const updateQuestionnaireBody = z.object({
  status: z.enum(QUESTIONNAIRE_STATUSES, { errorMap: () => ({ message: 'Invalid status.' }) }).optional(),
  dogId: z
    .string({ invalid_type_error: 'Choose an existing dog.' })
    .refine(isObjectId, 'Choose an existing dog.')
    .nullable()
    .optional(),
});
export type UpdateQuestionnaireBody = z.infer<typeof updateQuestionnaireBody>;
