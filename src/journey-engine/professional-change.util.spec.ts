import { BadRequestException } from '@nestjs/common';
import { persistProfessionalChange, PROFESSIONAL_CHANGE_INTERVAL_MS } from './professional-change.util';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date('2026-10-26T12:00:00Z');
const data = { userId: 'member-1', nodeCode: 'W3_M1', journeyWeek: 3, type: 'USER_CHANGE' as const, requestKey: 'new-request', reviewSummary: 'Updated my preparation' };
function fixture(latest: null | { createdAt: Date } = null, replay: object | null = null) {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(1), sideTaskSubmission: { findFirst: jest.fn().mockResolvedValueOnce(replay).mockResolvedValueOnce(latest), create: jest.fn().mockResolvedValue({ id: 'saved' }) } };
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
  return { tx, prisma: prisma as unknown as PrismaService };
}
describe('professional update cooldown', () => {
  it('serializes members before checking the latest saved update', async () => {
    const {tx,prisma}=fixture();
    await persistProfessionalChange(prisma,data,()=>now);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.sideTaskSubmission.findFirst.mock.invocationCallOrder[0]);
    expect(tx.sideTaskSubmission.create).toHaveBeenCalledWith({data:{...data,createdAt:now}});
  });
  it('rejects a new update one millisecond before 72 hours and reports its unlock time', async () => {
    const {tx,prisma}=fixture({createdAt:new Date(now.getTime()-PROFESSIONAL_CHANGE_INTERVAL_MS+1)});
    try {await persistProfessionalChange(prisma,data,()=>now);throw new Error('unexpected success');} catch(error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({code:'CHANGE_COOLDOWN',nextAvailableAt:new Date(now.getTime()+1).toISOString()});
    }
    expect(tx.sideTaskSubmission.create).not.toHaveBeenCalled();
  });
  it('allows another update exactly at 72 hours', async () => {
    const {tx,prisma}=fixture({createdAt:new Date(now.getTime()-PROFESSIONAL_CHANGE_INTERVAL_MS)});
    await persistProfessionalChange(prisma,data,()=>now);
    expect(tx.sideTaskSubmission.create).toHaveBeenCalledTimes(1);
  });
  it('replays an accepted request without consuming another slot', async () => {
    const {tx,prisma}=fixture(null,{id:'existing'});
    expect(await persistProfessionalChange(prisma,data,()=>now)).toEqual({id:'existing'});
    expect(tx.sideTaskSubmission.create).not.toHaveBeenCalled();
  });
});
