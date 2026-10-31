import {
  IsUUID,
  IsArray,
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
} from 'class-validator';
export class OperationsSettingsDto {
  @IsInt() @Min(0) revision: number;
  @IsIn(['OPEN', 'PAUSED', 'LIMITED']) admissionMode:
    'OPEN' | 'PAUSED' | 'LIMITED';
  @IsInt() @Min(1) @Max(1000000) maxMembers: number;
  @IsInt() @Min(10) @Max(1000000) cvQuotaMiB: number;
  @IsInt() @Min(128) @Max(1000000) diskReserveMiB: number;
  @IsNumber() @Min(0.1) @Max(100000) uplinkMbps: number;
  @IsInt() @Min(1) @Max(100000) activeWarn: number;
  @IsInt() @Min(2) @Max(100000) activeCritical: number;
  @IsInt() @Min(50) @Max(60000) latencyWarnMs: number;
  @IsInt() @Min(100) @Max(120000) latencyCriticalMs: number;
  @IsNumber() @Min(0.1) @Max(100) errorWarnPercent: number;
  @IsNumber() @Min(0.2) @Max(100) errorCriticalPercent: number;
  @IsInt() @Min(1) @Max(99) cpuWarn: number;
  @IsInt() @Min(2) @Max(100) cpuCritical: number;
  @IsInt() @Min(1) @Max(99) memoryWarn: number;
  @IsInt() @Min(2) @Max(100) memoryCritical: number;
}

export class BrowserTimingsDto {
  @IsUUID('4') accountId: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @Min(0, { each: true })
  @Max(120000, { each: true })
  timingsMs: number[];
}
