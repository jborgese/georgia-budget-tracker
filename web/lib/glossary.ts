const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  education: "Public schools, universities, technical colleges, pre-K, and student aid.",
  health_and_welfare: "Health care, public health, and assistance programs.",
  public_safety: "Law enforcement, jails and prisons, fire protection, and emergency services.",
  public_works: "Roads, bridges, transit, drainage, and other infrastructure.",
  general_government: "Running the government itself — administration, elections, tax collection, and buildings.",
  judicial: "The courts, judges, prosecutors, and public defenders.",
  community_and_economic_development: "Planning, zoning, housing, and programs to attract jobs and business.",
  natural_resources: "Parks, wildlife, farming programs, forestry, and environmental protection.",
  culture_and_recreation: "Parks, libraries, and recreation programs.",
  enterprise_operations: "Self-funded services billed to users — water, sewer, solid waste, airports.",
  intergovernmental_expenditure: "Payments passed to other governments — cities, school boards, authorities.",
  debt_service: "Payments on borrowed money.",
  other_expenditure: "Spending that doesn't fit the other categories, plus bookkeeping differences.",
};

const AGENCY_DESCRIPTIONS: Record<string, string> = {
  "Georgia Senate": "The upper chamber of the state legislature.",
  "Georgia House of Representatives": "The lower chamber of the state legislature.",
  "General Assembly": "Shared offices and services of the state legislature.",
  "Department of Audits and Accounts": "Audits how state and local governments spend money.",
  "Court of Appeals": "Georgia's intermediate appeals court.",
  "Judicial Council": "Administration for the statewide court system.",
  "Juvenile Courts": "Courts handling cases involving children.",
  "Prosecuting Attorneys": "District attorneys who prosecute crimes.",
  "Superior Courts": "Georgia's main trial courts.",
  "Supreme Court": "Georgia's highest court.",
  "Georgia Public Defender Council": "Legal defense for people who can't afford a lawyer.",
  "State Accounting Office": "Keeps the state's books and financial reports.",
  "Department of Administrative Services": "Purchasing, vehicle fleet, and shared services for agencies.",
  "Department of Agriculture": "Food safety inspections and farm programs.",
  "Department of Banking and Finance": "Regulates banks and lenders.",
  "Department of Behavioral Health and Developmental Disabilities":
    "Mental health, substance abuse, and developmental disability services.",
  "Department of Community Affairs": "Housing programs and help for local governments.",
  "Department of Community Health": "Runs Medicaid and state employee health plans.",
  "Department of Community Supervision": "Supervises people on probation and parole.",
  "Department of Corrections": "State prisons.",
  "Department of Defense": "The Georgia National Guard.",
  "Department of Driver Services": "Driver's licenses and ID cards.",
  "Department of Economic Development": "Recruits businesses and promotes tourism.",
  "Department of Education": "K-12 public schools.",
  "Department of Human Services": "Child welfare, food assistance, and services for seniors.",
  "Department of Juvenile Justice": "Detention and programs for youth offenders.",
  "Department of Labor": "Unemployment benefits and job services.",
  "Department of Law": "The Attorney General's office.",
  "Department of Natural Resources": "State parks, wildlife, and environmental protection.",
  "Department of Public Health": "Disease control, health screenings, and county health departments.",
  "Department of Public Safety": "State troopers and highway patrol.",
  "Department of Revenue": "Collects state taxes.",
  "Department of Transportation": "Builds and maintains roads, bridges, and transit.",
  "Department of Veterans Service": "Helps veterans and their families claim benefits.",
  "Board of Regents of the University System of Georgia":
    "Georgia's public universities and colleges.",
  "Bright from the Start: Georgia Department of Early Care and Learning":
    "Pre-K and child care programs.",
  "Commissioner of Insurance": "Regulates insurance companies and rates.",
  "Employees' Retirement System of Georgia": "Pensions for state employees.",
  "Georgia Bureau of Investigation": "Statewide criminal investigations and crime labs.",
  "Georgia General Obligation Debt Sinking Fund": "Payments on the state's bonds.",
  "Georgia State Financing and Investment Commission":
    "Manages state construction projects and bond money.",
  "Georgia Student Finance Commission": "HOPE scholarships and student financial aid.",
  "Office of the Governor": "The Governor's office and budget staff.",
  "Public Service Commission": "Regulates electric, gas, and telecom utilities.",
  "Secretary of State": "Elections, business registrations, and professional licenses.",
  "State Board of Pardons and Paroles": "Decides parole and pardons.",
  "State Forestry Commission": "Forest management and wildfire response.",
  "State Properties Commission": "Manages state-owned real estate.",
  "State Board of Workers' Compensation": "The system for workplace injury claims.",
  "Teachers Retirement System": "Pensions for public school teachers.",
  "Technical College System of Georgia": "Technical colleges and adult education.",
};

const RLGF_SECTION_TOPICS: Record<string, string> = {
  A: "running the government itself — administration, elections, tax collection, buildings",
  B: "the courts — judges, clerks, sheriffs' court duties",
  C: "the sheriff, police, jail, fire protection, EMS, and emergency management",
  D: "roads, bridges, drainage, solid waste, and other infrastructure",
  E: "public health services and assistance programs",
  F: "parks, libraries, and recreation programs",
  G: "planning, zoning, housing, and economic development",
};

const FIXED_DESCRIPTIONS: Record<string, string> = {
  "Enterprise Fund Current Operations Expense":
    "Day-to-day costs of self-funded services billed to users, like water and sewer.",
  "Enterprise Fund Interest Expense":
    "Interest paid on debt owed by self-funded services like water and sewer.",
  "PART X INTERGOVERNMENTAL EXPENDITURES":
    "Money passed to other governments — cities, school boards, authorities.",
};

const SALES_TAX_DESCRIPTIONS: Record<string, string> = {
  "Local Option Sales Tax (LOST) Counties Only":
    "A 1% sales tax shared between a county and its cities; the proceeds must reduce property tax rates, and the split is renegotiated every ten years.",
  "Special Purpose Local Option Sales Tax (SPLOST)":
    "A 1% county sales tax, approved by voters, that pays for specific capital projects like roads, parks, and buildings.",
  "Local Option Sales Tax - Homestead (HOST)":
    "A 1% sales tax used to fund homestead property-tax exemptions, with any remainder for capital projects.",
  "Special Purpose Local Option Sales Tax (TSPLOST) Regional":
    "A voter-approved 1% sales tax for transportation projects, shared across a multi-county region.",
  "Special Purpose Local Option Sales Tax (TSPLOST2) Single County":
    "A voter-approved sales tax (up to 1%) for transportation projects in a single county.",
  "Municipal Option Sales Tax (MOST) Atlanta Only":
    "Atlanta's 1% sales tax that funds water and sewer system improvements.",
  "Local Option Sales Tax (O-LOST) Columbus-Muscogee only":
    "An additional local option sales tax levied only by the Columbus-Muscogee consolidated government.",
  "MARTA Sales Tax (DeKalb, Fulton , Clayton)":
    "The 1% sales tax that funds MARTA transit, levied in Fulton, DeKalb, and Clayton counties and the City of Atlanta.",
};

const DEBT_TYPE_DESCRIPTIONS: Record<string, string> = {
  "Revenue Bond Debt":
    "Bonds repaid from a specific revenue stream, like water bills or tolls — not from general taxes.",
  "GO Bond Debt":
    "General obligation bonds backed by the government's power to tax; voters must approve them.",
  "Other Long-term Debt":
    "Long-term borrowing other than bonds, such as government loans and installment contracts.",
  "Capital Leases Payable":
    "Long-term leases for equipment or buildings that work like installment purchases.",
  "Short Term Notes":
    "Borrowing due within a year, often to cover expenses before tax payments arrive.",
  "Special Assessment Debt":
    "Debt repaid by charges on the specific properties that benefit from an improvement.",
};

const SCHOOL_TERM_DESCRIPTIONS: Record<string, string> = {
  "Local property taxes":
    "The district's own property tax levy. Georgia districts must levy at least 5 mills as their required local share.",
  "Local sales taxes (ESPLOST)":
    "Education SPLOST — a voter-approved 1% sales tax that school districts levy separately for buildings, buses, and other capital projects.",
  "State aid":
    "State funding, mostly the Quality Basic Education (QBE) formula that allots money per student.",
  "Federal aid":
    "Federal programs like Title I, special education grants, and school meals funding.",
  "Parent government contributions":
    "Money transferred from the city or county government associated with the school system.",
  Instruction:
    "Teachers and classroom activity: salaries, benefits, supplies, and purchased instruction services.",
  "Support services":
    "Everything supporting the classroom: administration, counselors, libraries, transportation, and building maintenance.",
  "Current spending":
    "Day-to-day operating costs — salaries, benefits, supplies — excluding construction and debt payments.",
};

export function describeSchoolTerm(term: string): string | null {
  return SCHOOL_TERM_DESCRIPTIONS[term] ?? null;
}

export function describeSalesTax(classification: string): string | null {
  return SALES_TAX_DESCRIPTIONS[classification] ?? null;
}

export function describeDebtType(debtType: string): string | null {
  return DEBT_TYPE_DESCRIPTIONS[debtType] ?? null;
}

const SYNTHETIC_NOTE =
  "A bookkeeping line: the difference between the county's reported total and the sum of its listed items.";

function describeSection(label: string): string | null {
  const match = label.match(/^Section ([A-G]) /);
  if (!match) return null;
  const topic = RLGF_SECTION_TOPICS[match[1]];
  if (!topic) return null;
  if (/Machinery and Equipment/.test(label)) {
    return `Equipment and vehicles bought for ${topic}.`;
  }
  if (/- Property/.test(label)) {
    return `Land and buildings bought or built for ${topic}.`;
  }
  if (/Intangibles/.test(label)) {
    return `Software and other non-physical assets bought for ${topic}.`;
  }
  return `Day-to-day operating costs of ${topic}.`;
}

export function describeCategory(key: string): string | null {
  return CATEGORY_DESCRIPTIONS[key] ?? null;
}

export function describeSubcategory(label: string): string | null {
  if (label.endsWith("(unallocated)") || label.endsWith("(reconciliation adjustment)")) {
    return SYNTHETIC_NOTE;
  }
  return (
    AGENCY_DESCRIPTIONS[label] ??
    FIXED_DESCRIPTIONS[label] ??
    describeSection(label) ??
    CATEGORY_LABEL_DESCRIPTIONS[label] ??
    null
  );
}

const CATEGORY_LABEL_DESCRIPTIONS: Record<string, string> = {
  Education: CATEGORY_DESCRIPTIONS.education,
  "Health & welfare": CATEGORY_DESCRIPTIONS.health_and_welfare,
  "Public safety": CATEGORY_DESCRIPTIONS.public_safety,
  "Public works & transportation": CATEGORY_DESCRIPTIONS.public_works,
  "General government": CATEGORY_DESCRIPTIONS.general_government,
  Judicial: CATEGORY_DESCRIPTIONS.judicial,
  "Community & economic development":
    CATEGORY_DESCRIPTIONS.community_and_economic_development,
  "Natural resources & agriculture": CATEGORY_DESCRIPTIONS.natural_resources,
  "Culture & recreation": CATEGORY_DESCRIPTIONS.culture_and_recreation,
  "Enterprise operations": CATEGORY_DESCRIPTIONS.enterprise_operations,
  Intergovernmental: CATEGORY_DESCRIPTIONS.intergovernmental_expenditure,
  "Debt service": CATEGORY_DESCRIPTIONS.debt_service,
  Other: CATEGORY_DESCRIPTIONS.other_expenditure,
};
