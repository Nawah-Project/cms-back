import { ExperienceService } from './experience.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExperienceProgressDto, ExperienceFlowParam } from './experience.module';
import { validate } from 'class-validator';

describe('Account experience progress', () => {
  it('imports an existing completed guide from durable events, never from application counts', async () => {
    const prisma = { userExperienceProgress: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ flowKey: 'first-application-v1', status: 'COMPLETED' }]) }, domainEventLog: { findFirst: jest.fn().mockResolvedValue({id:'event'}) }, $queryRaw: jest.fn().mockResolvedValue([{}]), application: { count: jest.fn() } };
    const service = new ExperienceService(prisma as unknown as PrismaService);
    const result = await service.getProgress('member');
    expect(result.items[0].status).toBe('COMPLETED');
    expect(prisma.domainEventLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({actorId:'member',eventName:'ux.tour_completed'})}));
    expect(prisma.application.count).not.toHaveBeenCalled();
  });
  it('leaves a legacy member with existing applications eligible for the mandatory guide without evidence of completion', async () => {
    const prisma={userExperienceProgress:{findMany:jest.fn().mockResolvedValue([])},domainEventLog:{findFirst:jest.fn().mockResolvedValue(null)},$queryRaw:jest.fn()};
    expect(await new ExperienceService(prisma as unknown as PrismaService).getProgress('legacy')).toEqual({items:[]});
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('rejects unknown guides, invalid steps and arbitrary outcomes', async () => {
    const row=Object.assign(new ExperienceProgressDto(),{status:'RESET',currentStep:-1});
    expect((await validate(row)).length).toBe(2);
    const param=Object.assign(new ExperienceFlowParam(),{flowKey:'delete-all-history'});
    expect((await validate(param)).length).toBe(1);
  });
});
