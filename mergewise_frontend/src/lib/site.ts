/**
 * Public site details — edit this file to update the About, Privacy and
 * Terms pages. Leave a link as "" and it shows as "coming soon" instead of
 * a broken link.
 */

export interface CreatorLinks {
  linkedin: string;
  x: string;
  github: string;
  resume: string;
  website: string;
  email: string;
}

export interface Creator {
  name: string;
  role: string;
  /** One or two sentences. Leave "" to hide. */
  bio: string;
  /** Image URL (e.g. your GitHub avatar). Leave "" to show initials. */
  photo: string;
  links: CreatorLinks;
}

export const CREATORS: Creator[] = [
  {
    name: "Abhishek Srivastava",
    role: "Co-creator",
    bio: "",
    photo: "https://github.com/abhisriv25.png",
    links: {
      linkedin: "",
      x: "",
      github: "https://github.com/abhisriv25",
      resume: "",
      website: "",
      email: "",
    },
  },
  {
    name: "Saumya Tiwari",
    role: "Co-creator",
    bio: "",
    photo: "",
    links: {
      linkedin: "",
      x: "",
      github: "",
      resume: "",
      website: "",
      email: "",
    },
  },
];

export const SITE = {
  name: "Mergewise",
  /** Shown on the Privacy and Terms pages. Leave "" to point people to the About page instead. */
  contactEmail: "",
  sourceUrl: "https://github.com/abhisriv25/Mergewise",
  policiesUpdated: "11 October 2026",
};
