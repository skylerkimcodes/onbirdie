export interface EmployerPublic {
  id: string;
  name: string;
  slug: string;
}

export interface UserPublic {
  id: string;
  email: string;
  employer_id: string;
}

export interface MeResponse {
  user: UserPublic;
  employer: EmployerPublic;
}
