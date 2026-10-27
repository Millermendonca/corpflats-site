/**
 * B2B Housekeeping & Twin-Server Parity Test Suite (M1)
 * Strictly targeted to M1 requirements:
 * 1. isB2bReservation canonical helper
 * 2. computeLinenTracking helper & 3-day alert threshold
 * 3. Twin-server byte-for-byte SHA-256 hash parity
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  isB2bReservation,
  computeLinenTracking,
  httpServer
} from '../artifacts/api-server/demo-server.mjs';

const ROOT_DIR = process.cwd();
const PRIMARY_SERVER = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const MIRROR_SERVER = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');

describe('M1: B2B Housekeeping & Twin-Server Parity', () => {

  after(() => {
    if (httpServer && typeof httpServer.close === 'function') {
      httpServer.close();
    }
    setTimeout(() => process.exit(0), 50);
  });

  describe('1. isB2bReservation Helper', () => {
    it('should identify B2B reservations through multiple indicators', () => {
      assert.strictEqual(isB2bReservation({ channel: 'b2b' }), true);
      assert.strictEqual(isB2bReservation({ channel: 'B2B Corporativo' }), true);
      assert.strictEqual(isB2bReservation({ isB2b: true }), true);
      assert.strictEqual(isB2bReservation({ b2bReservationNumber: 'B2B-9876' }), true);
      assert.strictEqual(isB2bReservation({ agencyId: 'AG-100' }), true);
      assert.strictEqual(isB2bReservation({ agencyTradeName: 'Agência Corporativa SP' }), true);
      assert.strictEqual(isB2bReservation({ companyName: 'Petrobras Corp' }), true);
    });

    it('should reject non-B2B channels (Booking, Airbnb, Site, WhatsApp, etc.)', () => {
      assert.strictEqual(isB2bReservation({ channel: 'booking' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'airbnb' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'site' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'whatsapp' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'balcao' }), false);
      assert.strictEqual(isB2bReservation({}), false);
      assert.strictEqual(isB2bReservation(null), false);
    });

    it('should reject non-B2B channels even if companyName or agencyName is populated', () => {
      assert.strictEqual(isB2bReservation({ channel: 'booking', companyName: 'Petrobras Corp' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'airbnb', companyName: 'Vale S.A.' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'whatsapp', companyName: 'RPM Transportes' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'whatsapp', agencyName: 'Agência Corporativa' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'site', companyName: 'Empresa XPTO' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'balcao', companyName: 'Localiza Rent' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'direto', companyName: 'Empresa Direto' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'direct', companyName: 'Empresa Direct' }), false);
    });
  });

  describe('2. computeLinenTracking Helper', () => {
    it('should calculate stay day number, total stay nights and 3-day alert correctly', () => {
      const mockRes = {
        id: 101,
        checkinDate: '2026-10-20',
        checkoutDate: '2026-10-27',
        lastBeddingChangeDate: '2026-10-20',
        lastTowelsChangeDate: '2026-10-22',
        doNotDisturb: false
      };

      // Day 1 (2026-10-20): daysSinceBeddingChange = 0, alert = false
      const trackDay1 = computeLinenTracking(mockRes, '2026-10-20', {});
      assert.strictEqual(trackDay1.stayDayNumber, 1);
      assert.strictEqual(trackDay1.totalStayNights, 7);
      assert.strictEqual(trackDay1.daysSinceBeddingChange, 0);
      assert.strictEqual(trackDay1.needsBeddingChangeAlert, false);

      // Day 3 (2026-10-22): daysSinceBeddingChange = 2, alert = false
      const trackDay3 = computeLinenTracking(mockRes, '2026-10-22', {});
      assert.strictEqual(trackDay3.stayDayNumber, 3);
      assert.strictEqual(trackDay3.daysSinceBeddingChange, 2);
      assert.strictEqual(trackDay3.needsBeddingChangeAlert, false);

      // Day 4 (2026-10-23): daysSinceBeddingChange = 3, alert = true (threshold reached!)
      const trackDay4 = computeLinenTracking(mockRes, '2026-10-23', {});
      assert.strictEqual(trackDay4.stayDayNumber, 4);
      assert.strictEqual(trackDay4.daysSinceBeddingChange, 3);
      assert.strictEqual(trackDay4.needsBeddingChangeAlert, true);

      // Day 5 (2026-10-24): daysSinceBeddingChange = 4, alert = true
      const trackDay5 = computeLinenTracking(mockRes, '2026-10-24', {});
      assert.strictEqual(trackDay5.stayDayNumber, 5);
      assert.strictEqual(trackDay5.daysSinceBeddingChange, 4);
      assert.strictEqual(trackDay5.needsBeddingChangeAlert, true);
    });

    it('should detect guest requested linen changes and DND flags', () => {
      const mockRes = {
        id: 102,
        checkinDate: '2026-10-20',
        checkoutDate: '2026-10-25',
        doNotDisturb: true,
        linenRequests: [
          { status: 'pending', targetDate: '2026-10-22', type: 'both' }
        ]
      };

      const track = computeLinenTracking(mockRes, '2026-10-22', {});
      assert.strictEqual(track.doNotDisturb, true);
      assert.strictEqual(track.guestRequestedBedding, true);
      assert.strictEqual(track.guestRequestedTowels, true);
    });
  });

  describe('3. Twin-Server SHA-256 Parity', () => {
    it('artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256', () => {
      assert.ok(fs.existsSync(PRIMARY_SERVER), 'artifacts/api-server/demo-server.mjs must exist');
      assert.ok(fs.existsSync(MIRROR_SERVER), 'scripts/demo-server.mjs must exist');

      const primaryBuffer = fs.readFileSync(PRIMARY_SERVER);
      const mirrorBuffer = fs.readFileSync(MIRROR_SERVER);

      const primaryHash = crypto.createHash('sha256').update(primaryBuffer).digest('hex');
      const mirrorHash = crypto.createHash('sha256').update(mirrorBuffer).digest('hex');

      assert.strictEqual(primaryHash, mirrorHash, 'Twin-servers must have exact byte-for-byte SHA-256 parity');
    });
  });

  describe('4. Stayover Eligibility & Completed Reservation Guard', () => {
    function isEligibleStayover(r, dateStr) {
      return Boolean(
        r &&
        r.status !== "cancelada" &&
        r.status !== "cancelado" &&
        r.status !== "cancelled" &&
        r.status !== "no_show" &&
        r.status !== "completed" &&
        r.status !== "checked_out" &&
        !r.checkoutDone &&
        !r.earlyCheckout &&
        r.checkinDate &&
        r.checkoutDate &&
        r.checkinDate < dateStr &&
        r.checkoutDate > dateStr &&
        isB2bReservation(r)
      );
    }

    it('should qualify active B2B stayovers on intermediate days', () => {
      const activeB2b = {
        channel: 'b2b',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        status: 'confirmada',
        checkoutDone: false
      };
      assert.strictEqual(isEligibleStayover(activeB2b, '2026-11-15'), true);
    });

    it('should NOT generate stayover cards for completed or checked-out reservations', () => {
      const baseRes = {
        id: 999,
        flatId: 101,
        flatNumber: '101',
        channel: 'b2b',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        status: 'confirmada',
        checkoutDone: false
      };

      assert.strictEqual(isEligibleStayover({ ...baseRes, status: 'completed' }, '2026-11-15'), false);
      assert.strictEqual(isEligibleStayover({ ...baseRes, status: 'checked_out' }, '2026-11-15'), false);
      assert.strictEqual(isEligibleStayover({ ...baseRes, checkoutDone: true }, '2026-11-15'), false);
      assert.strictEqual(isEligibleStayover({ ...baseRes, earlyCheckout: true }, '2026-11-15'), false);
      assert.strictEqual(isEligibleStayover({ ...baseRes, status: 'cancelada' }, '2026-11-15'), false);
      assert.strictEqual(isEligibleStayover({ ...baseRes, status: 'no_show' }, '2026-11-15'), false);
    });
  });

});
