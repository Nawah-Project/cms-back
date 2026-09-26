import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApplicationsService } from './applications.service';
import { ApplicationStage } from './enums/application-stage.enum';
import { ApplicationOutcome } from './enums/application-outcome.enum';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;

  const mockApplication = {
    id: 'app-uuid-1',
    userId: 'user-1',
    companyName: 'Vodafone',
    jobTitle: 'UX Designer',
    applicationDate: '2026-09-26',
    location: 'Cairo',
    applicationMethod: null,
    jobUrl: null,
    stage: ApplicationStage.APPLIED,
    outcome: ApplicationOutcome.NONE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDashboard: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        {
          provide: ApplicationsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto: CreateApplicationDto = {
        companyName: 'Vodafone',
        jobTitle: 'UX Designer',
      };
      mockService.create.mockResolvedValue(mockApplication);

      const result = await controller.create('user-1', dto);

      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockApplication);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with userId and query', async () => {
      const query: ApplicationQueryDto = { page: 1, limit: 10 };
      const paginatedResult = {
        data: [mockApplication],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll('user-1', query);

      expect(mockService.findAll).toHaveBeenCalledWith('user-1', query);
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('getDashboard', () => {
    it('should call service.getDashboard with userId', async () => {
      const dashboardStats = {
        active: { total: 1, applied: 1, interview: 0, decision: 0 },
        closed: { total: 0, accepted: 0, rejected: 0, withdrawn: 0 },
      };
      mockService.getDashboard.mockResolvedValue(dashboardStats);

      const result = await controller.getDashboard('user-1');

      expect(mockService.getDashboard).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(dashboardStats);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with userId and id', async () => {
      mockService.findOne.mockResolvedValue(mockApplication);

      const result = await controller.findOne('user-1', 'app-uuid-1');

      expect(mockService.findOne).toHaveBeenCalledWith('user-1', 'app-uuid-1');
      expect(result).toEqual(mockApplication);
    });
  });

  describe('update', () => {
    it('should call service.update with userId, id and dto', async () => {
      const dto: UpdateApplicationDto = { jobTitle: 'Senior UX Designer' };
      const updatedApp = { ...mockApplication, jobTitle: 'Senior UX Designer' };
      mockService.update.mockResolvedValue(updatedApp);

      const result = await controller.update('user-1', 'app-uuid-1', dto);

      expect(mockService.update).toHaveBeenCalledWith(
        'user-1',
        'app-uuid-1',
        dto,
      );
      expect(result).toEqual(updatedApp);
    });
  });

  describe('remove', () => {
    it('should call service.remove with userId and id', async () => {
      const removeResponse = {
        success: true,
        message: 'Application with ID "app-uuid-1" successfully deleted',
      };
      mockService.remove.mockResolvedValue(removeResponse);

      const result = await controller.remove('user-1', 'app-uuid-1');

      expect(mockService.remove).toHaveBeenCalledWith('user-1', 'app-uuid-1');
      expect(result).toEqual(removeResponse);
    });
  });
});
