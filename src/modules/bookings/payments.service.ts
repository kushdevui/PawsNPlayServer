import { Types } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { isObjectId } from '../../utils/objectId.js';
import { withFacilityLock } from '../settings/settings.service.js';
import { PAYMENT_METHODS, PAYMENT_TYPES, type PaymentMethod, type PaymentType } from './bookings.model.js';
import { money, paymentTotals } from './bookings.rules.js';
import type { CreatePaymentBody } from './bookings.schema.js';
import { withDog, type PublicBooking } from './bookings.serializer.js';
import { findBooking } from './bookings.service.js';

/**
 * POST /bookings/:id/payments (spec §7.6). Checks in the mock's order; runs under the facility lock so two
 * payments recorded at once cannot both pass the balance check.
 */
export async function addPayment(caller: AuthUser, id: string, body: CreatePaymentBody): Promise<PublicBooking> {
  const saved = await withFacilityLock(async () => {
    const booking = await findBooking(id);
    const type = (body.type ?? 'payment') as PaymentType;
    const method = (body.method ?? 'cash') as PaymentMethod;
    const value = Number(body.amount);

    if (!(value > 0) || !Number.isFinite(value)) throw AppError.validation('Enter an amount above 0.');
    if (!PAYMENT_TYPES.includes(type)) throw AppError.validation('Invalid payment type.');
    if (!PAYMENT_METHODS.includes(method)) throw AppError.validation('Invalid payment method.');

    const amount = money(value);
    const { amountPaid, balanceDue } = paymentTotals(booking, booking.payments);
    if (type === 'refund' && amount > amountPaid) {
      throw AppError.validation(`Refund can't be more than the ₹${amountPaid} received.`);
    }
    if (type !== 'refund' && booking.status === 'cancelled') {
      throw AppError.rule('INVALID_STATE', 'This booking is cancelled - record a refund instead.');
    }
    if (type !== 'refund' && amount > balanceDue) {
      throw AppError.rule('OVERPAYMENT', `Only ₹${Math.max(0, balanceDue)} is due on this booking.`, { balanceDue });
    }
    let receivedAt = now();
    if (body.receivedAt !== undefined && body.receivedAt !== null && body.receivedAt !== '') {
      const parsed =
        typeof body.receivedAt === 'string' || typeof body.receivedAt === 'number' ? new Date(body.receivedAt) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) throw AppError.validation('Invalid payment date.');
      receivedAt = parsed;
    }

    booking.payments.push({
      _id: new Types.ObjectId(),
      amount,
      type,
      method,
      note: body.note == null ? '' : String(body.note).trim().slice(0, 500),
      receivedAt,
      recordedBy: new Types.ObjectId(caller.id),
    });
    return booking.save();
  });
  return withDog(saved);
}

/** DELETE /bookings/:id/payments/:paymentId (spec §7.6): removes a payment entered by mistake. */
export async function removePayment(id: string, paymentId: string): Promise<PublicBooking> {
  const saved = await withFacilityLock(async () => {
    const booking = await findBooking(id);
    const index = isObjectId(paymentId) ? booking.payments.findIndex((p) => p._id.equals(paymentId)) : -1;
    if (index === -1) throw AppError.notFound('Payment');
    booking.payments.splice(index, 1);
    return booking.save();
  });
  return withDog(saved);
}
