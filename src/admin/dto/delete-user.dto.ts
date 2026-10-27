import { Transform } from "class-transformer";
import { Equals, IsEmail, MaxLength } from "class-validator";
export class DeleteUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;
  @Equals("DELETE_PERMANENTLY") confirmation: string;
}
