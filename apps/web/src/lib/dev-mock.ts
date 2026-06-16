// =============================================================================
// DEV mock data + helpers
// Chỉ hoạt động khi env Supabase là placeholder.
// Khi deploy production (env thật), file này không được sử dụng.
// =============================================================================
import type { PaginatedResponse } from "@inventorypro/shared-types";

export const IS_DEV_MOCK =
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://") ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400_000).toISOString();
const lastWeek = new Date(Date.now() - 7 * 86400_000).toISOString();
const year = new Date().getFullYear();
const oneYearLater = new Date(Date.now() + 365 * 86400_000).toISOString().split("T")[0];
const contractStart = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];

export const MOCK_PRODUCTS = [
  { id: "p1", sku: "SP-001", name: "Bút bi xanh 0.5mm", barcode: "8934567890123", productType: "GOODS", status: "ACTIVE", costPrice: 1500, sellPrice: 3000, minStock: 100, maxStock: 1000, categoryId: "c1", categoryName: "Văn phòng phẩm", baseUnitId: "u1", baseUnitCode: "CÁI", isBatchTracked: false, isSerialTracked: false, isExpiryTracked: false, imageUrl: null, createdAt: lastWeek, updatedAt: now },
  { id: "p2", sku: "SP-002", name: "Giấy A4 80gsm (500 tờ)", barcode: null, productType: "GOODS", status: "ACTIVE", costPrice: 75000, sellPrice: 95000, minStock: 50, maxStock: 500, categoryId: "c1", categoryName: "Văn phòng phẩm", baseUnitId: "u2", baseUnitCode: "RAM", isBatchTracked: false, isSerialTracked: false, isExpiryTracked: false, imageUrl: null, createdAt: lastWeek, updatedAt: now },
  { id: "p3", sku: "RM-001", name: "Thép tấm 5mm", barcode: null, productType: "RAW_MATERIAL", status: "ACTIVE", costPrice: 25000000, sellPrice: 28000000, minStock: 10, maxStock: 100, categoryId: "c2", categoryName: "Nguyên vật liệu", baseUnitId: "u3", baseUnitCode: "TẤM", isBatchTracked: true, isSerialTracked: false, isExpiryTracked: false, imageUrl: null, createdAt: lastWeek, updatedAt: now },
  { id: "p4", sku: "FG-001", name: "Bàn làm việc gỗ công nghiệp", barcode: null, productType: "FINISHED_GOOD", status: "ACTIVE", costPrice: 1500000, sellPrice: 2200000, minStock: 5, maxStock: 50, categoryId: "c3", categoryName: "Thành phẩm", baseUnitId: "u1", baseUnitCode: "CÁI", isBatchTracked: false, isSerialTracked: false, isExpiryTracked: false, imageUrl: null, createdAt: lastWeek, updatedAt: now },
  // Khoa XN — Module 1: HC-SP & VTYT mẫu
  { id: "pxn1", sku: "HO-SH-001", name: "Glucose (Hexokinase)", barcode: null, productType: "CONSUMABLE", status: "ACTIVE", costPrice: 85000, sellPrice: 120000, minStock: 10, maxStock: 20, categoryId: null, categoryName: null, baseUnitId: "u1", baseUnitCode: "CHAI", isBatchTracked: true, isSerialTracked: false, isExpiryTracked: true, imageUrl: null, createdAt: lastWeek, updatedAt: now, productGroup: "HOA_CHAT_SINH_PHAM", productSubtype: "REAGENT", openVialStabilityDays: 28, storageCondition: "REFRIGERATED", isActive: true, createdBy: "u-keeper-bulk-hc" },
  { id: "pxn2", sku: "HO-SH-045", name: "HBsAg Test Kit", barcode: null, productType: "CONSUMABLE", status: "ACTIVE", costPrice: 250000, sellPrice: 380000, minStock: 15, maxStock: 30, categoryId: null, categoryName: null, baseUnitId: "u1", baseUnitCode: "TEST", isBatchTracked: true, isSerialTracked: false, isExpiryTracked: true, imageUrl: null, createdAt: lastWeek, updatedAt: now, productGroup: "HOA_CHAT_SINH_PHAM", productSubtype: "REAGENT", openVialStabilityDays: 60, storageCondition: "REFRIGERATED", isActive: true, createdBy: "u-keeper-bulk-hc" },
  { id: "pxn3", sku: "VT-EDTA-001", name: "Ống nghiệm EDTA K2 (3ml)", barcode: null, productType: "CONSUMABLE", status: "ACTIVE", costPrice: 2500, sellPrice: 3500, minStock: 200, maxStock: 1000, categoryId: null, categoryName: null, baseUnitId: "u1", baseUnitCode: "ỐNG", isBatchTracked: false, isSerialTracked: false, isExpiryTracked: true, imageUrl: null, createdAt: lastWeek, updatedAt: now, productGroup: "VAT_TU_Y_TE", productSubtype: "CONSUMABLE_MEDICAL", openVialStabilityDays: null, storageCondition: "ROOM_TEMP", isActive: true, createdBy: "u-keeper-bulk-vtyt" },
  { id: "pxn4", sku: "VT-GLUC-STRIP", name: "Que thử Glucose (máy đo đường huyết)", barcode: null, productType: "CONSUMABLE", status: "ACTIVE", costPrice: 1800, sellPrice: 2500, minStock: 300, maxStock: 1500, categoryId: null, categoryName: null, baseUnitId: "u1", baseUnitCode: "QUE", isBatchTracked: true, isSerialTracked: false, isExpiryTracked: true, imageUrl: null, createdAt: lastWeek, updatedAt: now, productGroup: "VAT_TU_Y_TE", productSubtype: "REAGENT_STRIP", openVialStabilityDays: 90, storageCondition: "DRY_PLACE", isActive: true, createdBy: "u-keeper-bulk-vtyt" },
];

export const MOCK_WAREHOUSES = [
  { id: "w1", branchId: "b1", name: "Kho tổng HCM", code: "WH-HCM-01", address: "123 Nguyễn Văn Cừ, Q5", phone: "028-1234-5678", managerId: null, isDefault: true, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 5, createdAt: lastWeek, updatedAt: now, role: null },
  { id: "w2", branchId: "b1", name: "Kho phụ liệu", code: "WH-HCM-02", address: "456 Lê Hồng Phong, Q10", phone: "028-8765-4321", managerId: null, isDefault: false, allowNegative: false, status: "ACTIVE", type: "ISSUE", locationCount: 3, createdAt: lastWeek, updatedAt: now, role: null },
  { id: "w3", branchId: "b2", name: "Kho Hà Nội", code: "WH-HN-01", address: "789 Cầu Giấy, HN", phone: "024-1234-5678", managerId: null, isDefault: true, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 4, createdAt: lastWeek, updatedAt: now, role: null },
  // Khoa XN — Module 1: 4 kho chuẩn (BULK/DAILY × HC-SP/VTYT)
  { id: "wxn1", branchId: "b1", name: "Kho chẵn HC-SP", code: "XN-BULK-HC", address: "Tầng 2 - Khoa XN", phone: "0292-xxx-001", managerId: "u-keeper-bulk-hc", isDefault: false, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 8, createdAt: lastWeek, updatedAt: now, role: "BULK_HC_SP" },
  { id: "wxn2", branchId: "b1", name: "Kho lẻ HC-SP", code: "XN-DAILY-HC", address: "Tầng 2 - Khoa XN", phone: "0292-xxx-002", managerId: "u-keeper-daily-hc-1", isDefault: false, allowNegative: false, status: "ACTIVE", type: "ISSUE", locationCount: 4, createdAt: lastWeek, updatedAt: now, role: "DAILY_HC_SP" },
  { id: "wxn3", branchId: "b1", name: "Kho chẵn VTYT", code: "XN-BULK-VT", address: "Tầng 1 - Khoa XN", phone: "0292-xxx-003", managerId: "u-keeper-bulk-vtyt", isDefault: false, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 6, createdAt: lastWeek, updatedAt: now, role: "BULK_VTYT" },
  { id: "wxn4", branchId: "b1", name: "Kho lẻ VTYT", code: "XN-DAILY-VT", address: "Tầng 1 - Khoa XN", phone: "0292-xxx-004", managerId: "u-keeper-daily-vtyt", isDefault: false, allowNegative: false, status: "ACTIVE", type: "ISSUE", locationCount: 3, createdAt: lastWeek, updatedAt: now, role: "DAILY_VTYT" },
];

export const MOCK_BRANCHES = [
  { id: "b1", name: "Main Branch HCM", code: "MAIN", isDefault: true, address: "TP.HCM", phone: "028-1234-5678" },
  { id: "b2", name: "Chi nhánh Hà Nội", code: "HN", isDefault: false, address: "Hà Nội", phone: "024-1234-5678" },
];

export const MOCK_CATEGORIES = [
  { id: "c1", name: "Văn phòng phẩm", code: "VPP", isActive: true },
  { id: "c2", name: "Nguyên vật liệu", code: "NVL", isActive: true },
  { id: "c3", name: "Thành phẩm", code: "TP", isActive: true },
];

export const MOCK_UNITS = [
  { id: "u1", code: "CÁI", name: "Cái", isActive: true },
  { id: "u2", code: "RAM", name: "Ram", isActive: true },
  { id: "u3", code: "TẤM", name: "Tấm", isActive: true },
  { id: "u4", code: "KG", name: "Kilogram", isActive: true },
];

export const MOCK_STOCK_LEVELS = [
  { productId: "p1", productSku: "SP-001", productName: "Bút bi xanh 0.5mm", baseUnitCode: "CÁI", branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01", locationId: "l1", locationCode: "A-01-01", batchNo: null, serialNo: null, quantity: 450, reservedQty: 20, availableQty: 430, avgCost: 1500, lastMovementAt: yesterday },
  { productId: "p2", productSku: "SP-002", productName: "Giấy A4 80gsm (500 tờ)", baseUnitCode: "RAM", branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01", locationId: "l2", locationCode: "A-01-02", batchNo: null, serialNo: null, quantity: 280, reservedQty: 0, availableQty: 280, avgCost: 75000, lastMovementAt: yesterday },
  { productId: "p3", productSku: "RM-001", productName: "Thép tấm 5mm", baseUnitCode: "TẤM", branchId: "b1", warehouseId: "w2", warehouseCode: "WH-HCM-02", locationId: "l3", locationCode: "B-01-01", batchNo: "BATCH-2026-001", serialNo: null, quantity: 45, reservedQty: 5, availableQty: 40, avgCost: 25000000, lastMovementAt: lastWeek },
  { productId: "p4", productSku: "FG-001", productName: "Bàn làm việc gỗ công nghiệp", baseUnitCode: "CÁI", branchId: "b2", warehouseId: "w3", warehouseCode: "WH-HN-01", locationId: "l4", locationCode: "C-01-01", batchNo: null, serialNo: null, quantity: 18, reservedQty: 2, availableQty: 16, avgCost: 1500000, lastMovementAt: yesterday },
];

export const MOCK_STOCK_MOVEMENTS = [
  { id: "m1", branchId: "b1", warehouseId: "w1", locationId: "l1", productId: "p1", productSku: "SP-001", productName: "Bút bi xanh 0.5mm", unitId: "u1", movementType: "IN", quantity: 100, unitCost: 1500, refType: "MANUAL", refId: null, notes: "Nhập hàng từ NCC ABC", batchNo: null, serialNo: null, expiryDate: null, idempotencyKey: "00000000-0000-0000-0000-000000000001", postedAt: yesterday },
  { id: "m2", branchId: "b1", warehouseId: "w1", locationId: "l1", productId: "p1", productSku: "SP-001", productName: "Bút bi xanh 0.5mm", unitId: "u1", movementType: "OUT", quantity: 30, unitCost: null, refType: "MANUAL", refId: null, notes: "Xuất cho phòng ban", batchNo: null, serialNo: null, expiryDate: null, idempotencyKey: "00000000-0000-0000-0000-000000000002", postedAt: now },
  { id: "m3", branchId: "b1", warehouseId: "w1", locationId: "l2", productId: "p2", productSku: "SP-002", productName: "Giấy A4 80gsm (500 tờ)", unitId: "u2", movementType: "IN", quantity: 50, unitCost: 75000, refType: "GRN", refId: "grn-001", notes: "Nhập GRN-202606-0001", batchNo: null, serialNo: null, expiryDate: null, idempotencyKey: "00000000-0000-0000-0000-000000000003", postedAt: yesterday },
  { id: "m4", branchId: "b1", warehouseId: "w1", locationId: "l1", productId: "p1", productSku: "SP-001", productName: "Bút bi xanh 0.5mm", unitId: "u1", movementType: "ADJUST_IN", quantity: 5, unitCost: 1500, refType: "STOCKTAKE", refId: "stk-001", notes: "Kiểm kê phát hiện thiếu → điều chỉnh tăng", batchNo: null, serialNo: null, expiryDate: null, idempotencyKey: "00000000-0000-0000-0000-000000000004", postedAt: now },
];

export const MOCK_PARTIES = [
  { id: "pa1", partyType: "SUPPLIER", code: "NCC-001", name: "Công ty TNHH Văn phòng phẩm ABC", taxCode: "0123456789", contactName: "Nguyễn Văn A", contactEmail: "a@abc.vn", contactPhone: "0901234567", address: "123 Lê Lợi, Q1", city: "TP.HCM", country: "VN", paymentTerms: 30, creditLimit: 100000000, bankAccount: "1234567890", bankName: "Vietcombank", notes: "NCC chính văn phòng phẩm", status: "ACTIVE", createdAt: lastWeek, updatedAt: now },
  { id: "pa2", partyType: "CUSTOMER", code: "KH-001", name: "Công ty CP Xây dựng XYZ", taxCode: "9876543210", contactName: "Trần Thị B", contactEmail: "b@xyz.vn", contactPhone: "0912345678", address: "456 Trần Hưng Đạo", city: "TP.HCM", country: "VN", paymentTerms: 0, creditLimit: 0, bankAccount: null, bankName: null, notes: null, status: "ACTIVE", createdAt: lastWeek, updatedAt: now },
  { id: "pa3", partyType: "BOTH", code: "BV-001", name: "Công ty TNHH Thép Mạnh Hùng", taxCode: "0246813579", contactName: "Lê Văn C", contactEmail: "c@manhhung.vn", contactPhone: "0923456789", address: "789 Xô Viết Nghệ Tĩnh", city: "Bình Dương", country: "VN", paymentTerms: 60, creditLimit: 500000000, bankAccount: "9876543210", bankName: "Techcombank", notes: "Vừa NCC vừa KH", status: "ACTIVE", createdAt: lastWeek, updatedAt: now },
];

export const MOCK_PURCHASE_ORDERS = [
  {
    id: "po1", poNumber: "PO-202606-0001", partyId: "pa1", partyName: "Công ty TNHH Văn phòng phẩm ABC", partyCode: "NCC-001",
    branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01",
    orderDate: yesterday, expectedDate: now, status: "POSTED", total: 7500000, paidAmount: 0, lineCount: 3,
    // ⭐ Thông tin thầu
    bidContractId: "ct1", bidContractNo: `HĐ-${year}-0001`,
    bidContractValue: 750_000_000, bidContractUsedValue: 45_000_000, bidContractRemainingValue: 705_000_000,
    bidContractEndDate: oneYearLater, bidContractDaysToExpiry: 335,
    bidLotId: "lot1", bidLotName: "Bút + Giấy + Mực",
    createdAt: yesterday, updatedAt: now,
  },
];

export const MOCK_GOODS_RECEIPTS = [
  { id: "grn1", grnNumber: "GRN-202606-0001", partyId: "pa1", partyName: "Công ty TNHH Văn phòng phẩm ABC", partyCode: "NCC-001", purchaseOrderId: "po1", poNumber: "PO-202606-0001", branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01", receiptDate: yesterday, status: "POSTED", postedBy: "admin", postedAt: now, lineCount: 3, createdAt: yesterday, updatedAt: now },
];

export const MOCK_STOCK_TRANSFERS = [
  { id: "t1", transferNumber: "TR-202606-0001", fromBranchId: "b1", fromWarehouseId: "w1", fromWarehouseCode: "WH-HCM-01", toBranchId: "b1", toWarehouseId: "w2", toWarehouseCode: "WH-HCM-02", transferDate: yesterday, status: "IN_TRANSIT", lineCount: 2, createdAt: yesterday, updatedAt: now },
];

export const MOCK_STOCK_TAKES = [
  { id: "stk1", stockTakeNumber: "STK-202606-0001", branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01", stockTakeDate: yesterday, status: "DRAFT", lineCount: 2, countedBy: null, countedAt: null, postedBy: null, postedAt: null, createdAt: yesterday, updatedAt: now },
];

export const MOCK_STOCK_ISSUES = [
  { id: "si1", issueNumber: "ISS-202606-0001", branchId: "b1", warehouseId: "w1", warehouseCode: "WH-HCM-01", purpose: "SALE", partyId: "pa2", partyName: "Công ty CP Xây dựng XYZ", partyCode: "KH-001", issueDate: now, status: "POSTED", lineCount: 1, createdAt: now, updatedAt: now },
];

// =============================================================================
// BIDDING (Đấu thầu - cho đơn vị công lập)
// =============================================================================
export const MOCK_BID_PLANS = [
  { id: "bp1", planNo: `KHĐT-${year}-0001`, fiscalYear: year, title: "Kế hoạch đấu thầu mua sắm vật tư năm " + year, totalEstimatedValue: 5_000_000_000, status: "APPROVED", approvedBy: "00000000-0000-0000-0000-000000000001", approvedAt: lastWeek, notes: "Phê duyệt bởi Giám đốc", createdAt: lastWeek, updatedAt: now, packageCount: 2 },
  { id: "bp2", planNo: `KHĐT-${year}-0002`, fiscalYear: year, title: "Kế hoạch mua sắm thiết bị văn phòng", totalEstimatedValue: 2_000_000_000, status: "DRAFT", approvedBy: null, approvedAt: null, notes: "Đang soạn thảo", createdAt: yesterday, updatedAt: now, packageCount: 0 },
];

export const MOCK_BID_PACKAGES = [
  { id: "pkg1", packageNo: "GTHAU-0001", packageName: "Gói thầu VTTH văn phòng 2026", bidPlanId: "bp1", bidPlanNo: `KHĐT-${year}-0001`, bidPackageType: "OPEN", bidPackageStatus: "PUBLISHED", publishDate: yesterday, bidOpenDate: yesterday, bidCloseDate: contractStart, totalEstimatedValue: 1_500_000_000, procurementMethod: "Đấu thầu rộng rãi", decisionNo: "QĐ-2026-001", decisionDate: lastWeek, notes: "", lotCount: 2, createdAt: lastWeek, updatedAt: now },
  { id: "pkg2", packageNo: "GTHAU-0002", packageName: "Gói thầu thiết bị y tế Q1", bidPlanId: "bp1", bidPlanNo: `KHĐT-${year}-0001`, bidPackageType: "LIMITED", bidPackageStatus: "DRAFT", publishDate: null, bidOpenDate: null, bidCloseDate: null, totalEstimatedValue: 3_500_000_000, procurementMethod: "Đấu thầu hạn chế", decisionNo: "QĐ-2026-002", decisionDate: lastWeek, notes: "", lotCount: 0, createdAt: lastWeek, updatedAt: now },
];

export const MOCK_BID_LOTS = [
  { id: "lot1", lotNo: "LOT-001", lotName: "Bút + Giấy + Mực", bidPackageId: "pkg1", bidPackageNo: "GTHAU-0001", bidLotStatus: "AWARDED", productCategory: "Văn phòng phẩm", estimatedValue: 800_000_000, quantityTotal: 5000, unit: "CÁI", awardedBidderId: "pa1", awardedBidderName: "Công ty TNHH Văn phòng phẩm ABC", awardedValue: 750_000_000, awardedDate: yesterday, decisionNo: "QĐ-TT-2026-001", contractId: "ct1", contractNo: `HĐ-${year}-0001`, lines: [], bidders: [], createdAt: lastWeek, updatedAt: now },
  { id: "lot2", lotNo: "LOT-002", lotName: "Hóa chất vệ sinh", bidPackageId: "pkg1", bidPackageNo: "GTHAU-0001", bidLotStatus: "AWARDED", productCategory: "Hóa chất", estimatedValue: 600_000_000, quantityTotal: 2000, unit: "KG", awardedBidderId: "pa3", awardedBidderName: "Công ty TNHH Thép Mạnh Hùng", awardedValue: 580_000_000, awardedDate: yesterday, decisionNo: "QĐ-TT-2026-002", contractId: "ct2", contractNo: `HĐ-${year}-0002`, lines: [], bidders: [], createdAt: lastWeek, updatedAt: now },
  { id: "lot3", lotNo: "LOT-003", lotName: "Thiết bị y tế", bidPackageId: "pkg2", bidPackageNo: "GTHAU-0002", bidLotStatus: "PUBLISHED", productCategory: "Thiết bị y tế", estimatedValue: 3_000_000_000, quantityTotal: 100, unit: "BỘ", awardedBidderId: null, awardedBidderName: null, awardedValue: null, awardedDate: null, decisionNo: null, contractId: null, contractNo: null, lines: [], bidders: [], createdAt: yesterday, updatedAt: now },
];

export const MOCK_BID_CONTRACTS = [
  {
    id: "ct1", contractNo: `HĐ-${year}-0001`, contractName: "HĐ cung cấp VTTH văn phòng 2026",
    bidLotId: "lot1", lotNo: "LOT-001", lotName: "Bút + Giấy + Mực",
    winningPartyId: "pa1", winningPartyName: "Công ty TNHH Văn phòng phẩm ABC", winningPartyCode: "NCC-001",
    contractValue: 750_000_000, contractStartDate: contractStart, contractEndDate: oneYearLater,
    usedValue: 45_000_000, remainingValue: 705_000_000, daysToExpiry: 335,
    bidContractStatus: "ACTIVE", paymentTerms: 30, advancePaymentPct: 20, retentionPct: 5, warrantyMonths: 12,
    signingDate: yesterday, notes: "HĐ 1 năm", createdAt: yesterday, updatedAt: now,
  },
  {
    id: "ct2", contractNo: `HĐ-${year}-0002`, contractName: "HĐ cung cấp hóa chất vệ sinh 2026",
    bidLotId: "lot2", lotNo: "LOT-002", lotName: "Hóa chất vệ sinh",
    winningPartyId: "pa3", winningPartyName: "Công ty TNHH Thép Mạnh Hùng", winningPartyCode: "BV-001",
    contractValue: 580_000_000, contractStartDate: contractStart, contractEndDate: oneYearLater,
    usedValue: 0, remainingValue: 580_000_000, daysToExpiry: 335,
    bidContractStatus: "ACTIVE", paymentTerms: 60, advancePaymentPct: 30, retentionPct: 0, warrantyMonths: 6,
    signingDate: yesterday, notes: "HĐ thanh toán 60 ngày", createdAt: yesterday, updatedAt: now,
  },
  {
    id: "ct3", contractNo: `HĐ-${year}-0003`, contractName: "HĐ cũ (đã hết hạn 50%)",
    bidLotId: null, lotNo: null, lotName: null,
    winningPartyId: "pa1", winningPartyName: "Công ty TNHH Văn phòng phẩm ABC", winningPartyCode: "NCC-001",
    contractValue: 100_000_000, contractStartDate: "2025-01-01", contractEndDate: "2025-12-31",
    usedValue: 100_000_000, remainingValue: 0, daysToExpiry: -180,
    bidContractStatus: "COMPLETED", paymentTerms: 0, advancePaymentPct: 0, retentionPct: 0, warrantyMonths: 0,
    signingDate: "2025-01-01", notes: "HĐ năm ngoái đã đóng", createdAt: "2025-01-01", updatedAt: "2025-12-31",
  },
];

export function paginatedMock<T>(items: T[], page = 1, pageSize = 20): PaginatedResponse<T> {
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return { items: paged, total: items.length, page, page_size: pageSize, has_more: start + pageSize < items.length };
}

// =============================================================================
// REPLENISHMENT (Dự trù cuối tháng)
// =============================================================================
export const MOCK_REPLENISHMENT_RUNS = [
  {
    id: "run1",
    runType: "MANUAL",
    fiscalYear: 2026, fiscalMonth: 6,
    asOfDate: "2026-05-31",
    triggeredByUser: "00000000-0000-0000-0000-000000000001",
    status: "COMPLETED",
    warehouseCount: 2, productCount: 4,
    totalEstimatedValue: 8_500_000,
    createdPurchaseRequestIds: ["pr-forecast-001"],
    errorMessage: null,
    createdAt: "2026-05-31T02:00:00Z",
  },
  {
    id: "run2",
    runType: "SCHEDULED",
    fiscalYear: 2026, fiscalMonth: 5,
    asOfDate: "2026-04-30",
    triggeredByUser: null,
    status: "COMPLETED",
    warehouseCount: 2, productCount: 3,
    totalEstimatedValue: 4_200_000,
    createdPurchaseRequestIds: ["pr-forecast-002"],
    errorMessage: null,
    createdAt: "2026-04-30T02:00:00Z",
  },
  {
    id: "run3",
    runType: "MANUAL",
    fiscalYear: 2026, fiscalMonth: 4,
    asOfDate: "2026-03-31",
    triggeredByUser: "00000000-0000-0000-0000-000000000001",
    status: "FAILED",
    warehouseCount: 0, productCount: 0,
    totalEstimatedValue: 0,
    createdPurchaseRequestIds: [],
    errorMessage: "Không tìm thấy kho RECEIVING nào active trong tenant.",
    createdAt: "2026-03-31T10:15:00Z",
  },
];

export const MOCK_FORECAST_LINES = [
  { productId: "p1", productSku: "SP-001", productName: "Bút bi xanh 0.5mm", unitId: "u1", unitCode: "CÁI", currentStock: 50, minStock: 100, maxStock: 1000, avgDailyOut: 5.56, forecastNextMonth: 167, suggestedReplenishQty: 217, estimatedUnitPrice: 1500, estimatedTotal: 325_500, bidContractId: "ct1", bidContractNo: `HĐ-${year}-0001`, bidLotId: "lot1", bidLotName: "Bút + Giấy + Mực", reason: "Trend 3 tháng: 500 / 90 ngày" },
  { productId: "p2", productSku: "SP-002", productName: "Giấy A4 80gsm (500 tờ)", unitId: "u2", unitCode: "RAM", currentStock: 30, minStock: 50, maxStock: 500, avgDailyOut: 3.33, forecastNextMonth: 100, suggestedReplenishQty: 120, estimatedUnitPrice: 75000, estimatedTotal: 9_000_000, bidContractId: "ct1", bidContractNo: `HĐ-${year}-0001`, bidLotId: "lot1", bidLotName: "Bút + Giấy + Mực", reason: "Trend 3 tháng: 300 / 90 ngày" },
  { productId: "p3", productSku: "RM-001", productName: "Thép tấm 5mm", unitId: "u3", unitCode: "TẤM", currentStock: 5, minStock: 10, maxStock: 100, avgDailyOut: 0, forecastNextMonth: 0, suggestedReplenishQty: 95, estimatedUnitPrice: 25_000_000, estimatedTotal: 2_375_000_000, bidContractId: null, bidContractNo: null, bidLotId: null, bidLotName: null, reason: "Không đủ lịch sử (0 lần OUT, cần >= 3)" },
  { productId: "p4", productSku: "FG-001", productName: "Bàn làm việc gỗ công nghiệp", unitId: "u1", unitCode: "CÁI", currentStock: 1, minStock: 5, maxStock: 50, avgDailyOut: 0.11, forecastNextMonth: 3, suggestedReplenishQty: 7, estimatedUnitPrice: 1_500_000, estimatedTotal: 10_500_000, bidContractId: null, bidContractNo: null, bidLotId: null, bidLotName: null, reason: "Trend 3 tháng: 10 / 90 ngày" },
];

// =============================================================================
// Khoa XN — Module 2: Mock lots
// =============================================================================
export const MOCK_LOTS = [
  {
    id: "lot1", tenantId: "t1", productId: "pxn1", warehouseId: "wxn1",
    lotNumber: "L-GLUC-2026-001", expirationDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    quantity: 50, packageVolume: 100, storageCondition: "REFRIGERATED",
    status: "APPROVED", qcRequired: true, openVialCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: "lot2", tenantId: "t1", productId: "pxn1", warehouseId: "wxn2",
    lotNumber: "L-GLUC-2026-002", expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    quantity: 20, packageVolume: 100, storageCondition: "REFRIGERATED",
    status: "IN_USE", qcRequired: true, openVialCount: 1,
    openVialOpenedAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
    openVialExpirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    openVialStabilityDays: 28, openVialQuantityRemaining: 95,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: "lot3", tenantId: "t1", productId: "pxn2", warehouseId: "wxn1",
    lotNumber: "L-HBS-2026-010", expirationDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    quantity: 30, packageVolume: 50, storageCondition: "REFRIGERATED",
    status: "PENDING_QC", qcRequired: true, openVialCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: "lot4", tenantId: "t1", productId: "pxn3", warehouseId: "wxn3",
    lotNumber: "L-EDTA-2026-005", expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    quantity: 1000, storageCondition: "ROOM_TEMP",
    status: "APPROVED", qcRequired: false, openVialCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
];

// =============================================================================
// FEFO MOCKS (Module 2 - Khoa XN)
// =============================================================================

export const MOCK_FEFO_PICK_RESPONSE = {
  picks: [
    {
      lotId: "lot1",
      lotNumber: "L-GLUC-2026-001",
      expirationDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      openVialExpirationDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      isOpenVial: true,
      pickQuantity: 5,
      pickOrder: 1,
      pickReason: "Open-vial (còn 6 ngày)",
    },
    {
      lotId: "lot2",
      lotNumber: "L-GLUC-2026-002",
      expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      openVialExpirationDate: null,
      isOpenVial: false,
      pickQuantity: 5,
      pickOrder: 2,
      pickReason: "FEFO (còn 5 ngày)",
    },
  ],
  totalRequested: 10,
  totalPicked: 10,
  shortage: 0,
  isSufficient: true,
  warnings: ["⚠️ Lô L-GLUC-2026-001 (open-vial) còn 6 ngày"],
};

export const MOCK_FEFO_COMPLIANCE = {
  totalPicks: 145,
  compliantPicks: 138,
  overridePicks: 6,
  expiredPicks: 1,
  complianceRate: 0.9517,
  overrideRate: 0.0414,
  topOverriddenProducts: [
    { productId: "pxn1", sku: "GLUC-001", name: "Glucose (HC-SP)", overrideCount: 3 },
    { productId: "pxn2", sku: "HBS-001", name: "HBsAg Test (HC-SP)", overrideCount: 2 },
    { productId: "pxn3", sku: "EDTA-005", name: "EDTA Tube (VTYT)", overrideCount: 1 },
  ],
  topOverrideUsers: [
    { userId: "u1", email: "nguyen.a@khoaxn.vn", overrideCount: 3 },
    { userId: "u2", email: "tran.b@khoaxn.vn", overrideCount: 2 },
  ],
  topOverrideReasons: [
    { overrideReason: "FEFO_INSUFFICIENT", reasonCount: 4 },
    { overrideReason: "FEFO_EXPIRED_SOON", reasonCount: 2 },
  ],
};

export const MOCK_FEFO_AUDIT_LOG = {
  data: [
    {
      id: "fal1",
      documentType: "STOCK_ISSUE",
      documentNumber: "SI-2026-0142",
      productId: "pxn1",
      warehouseId: "wxn1",
      requestedQuantity: 10,
      fefoFirstLotId: "lot1",
      fefoFirstLotExpiration: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      actualLotId: "lot2",
      actualLotNumber: "L-GLUC-2026-002",
      actualLotExpiration: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      actualLotStatus: "IN_USE",
      isFefoCompliant: false,
      isExpiredUsed: false,
      overrideReason: "FEFO_INSUFFICIENT",
      overrideDescription: "Lô L-GLUC-2026-001 chỉ còn 5 chai, không đủ cho 10 yêu cầu",
      auditLevel: "WARNING",
      userEmail: "nguyen.a@khoaxn.vn",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "fal2",
      documentType: "STOCK_ISSUE",
      documentNumber: "SI-2026-0138",
      productId: "pxn2",
      warehouseId: "wxn1",
      requestedQuantity: 5,
      fefoFirstLotId: "lot3",
      fefoFirstLotExpiration: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      actualLotId: "lot-expired",
      actualLotNumber: "L-HBS-2025-099",
      actualLotExpiration: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      actualLotStatus: "EXPIRED",
      isFefoCompliant: false,
      isExpiredUsed: true,
      overrideReason: "EMERGENCY",
      overrideDescription: "Cấp cứu bệnh nhân lúc 23h, không có lô APPROVED. Kết quả XN sẽ được kiểm tra chéo với control.",
      auditLevel: "CRITICAL",
      userEmail: "tran.b@khoaxn.vn",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
};

// =============================================================================
// OPEN-VIAL MOCKS (Module 2 - Khoa XN)
// =============================================================================

export const MOCK_OPEN_VIAL_EXPIRING = [
  {
    lotId: "ov1",
    lotNumber: "L-GLUC-2026-OV-001",
    productName: "Glucose (HC-SP)",
    productSku: "GLUC-001",
    openVialExpirationDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: -3,
    alertLevel: "CRITICAL",
    message: "🔴 [QUÁ HẠN 3 ngày] Glucose (lô L-GLUC-2026-OV-001) — open-vial hết hạn",
  },
  {
    lotId: "ov2",
    lotNumber: "L-HBS-2026-OV-005",
    productName: "HBsAg Test (HC-SP)",
    productSku: "HBS-001",
    openVialExpirationDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: 1,
    alertLevel: "CRITICAL",
    message: "🔴 [1 NGÀY] HBsAg Test (lô L-HBS-2026-OV-005) — open-vial hết hạn",
  },
  {
    lotId: "ov3",
    lotNumber: "L-ALT-2026-OV-002",
    productName: "ALT (HC-SP)",
    productSku: "ALT-001",
    openVialExpirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: 5,
    alertLevel: "WARNING",
    message: "🟡 [5 NGÀY] ALT (lô L-ALT-2026-OV-002) — open-vial hết hạn",
  },
];

export const MOCK_OPEN_VIAL_STATUS = {
  isOpen: true,
  openedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  openedByUser: "u1",
  openVialExpirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  daysUntilExpiry: 3,
  volumeRemaining: 72.5,
  needsQcRetest: false,
  qcRetestReason: "Còn hạn open-vial",
  lastQcRetestAt: null,
  lastQcRetestResult: null,
  qcRetestValidUntil: null,
  openVialCount: 1,
};

export const MOCK_OPEN_VIAL_LOTS = {
  data: [
    {
      id: "ov1",
      lotNumber: "L-GLUC-2026-OV-001",
      productId: "pxn1",
      productSku: "GLUC-001",
      productName: "Glucose (HC-SP)",
      warehouseId: "wxn1",
      openVialOpenedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      openVialExpirationDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      openVialQuantityRemaining: 25,
      openVialCount: 1,
      status: "IN_USE",
    },
    {
      id: "ov2",
      lotNumber: "L-HBS-2026-OV-005",
      productId: "pxn2",
      productSku: "HBS-001",
      productName: "HBsAg Test (HC-SP)",
      warehouseId: "wxn1",
      openVialOpenedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      openVialExpirationDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      openVialQuantityRemaining: 18,
      openVialCount: 2,
      status: "IN_USE",
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
};

// =============================================================================
// BID TRACKING MOCKS
// =============================================================================

export const MOCK_BID_DASHBOARD = {
  totalContracts: 18,
  activeContracts: 12,
  expiring30Days: 2,
  expiring60Days: 4,
  expiring90Days: 7,
  totalContractValue: 8_540_000_000,
  totalUsedValue: 3_215_000_000,
  totalRemainingValue: 5_325_000_000,
  avgUsagePercent: 0.3765,
};

export const MOCK_BID_EXPIRING = [
  {
    contractId: "bc1",
    contractNumber: "HD-2026-001",
    supplierName: "Công ty CP Thiết bị Y tế Hà Nội",
    endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: 25,
    alertLevel: "CRITICAL",
    totalContractValue: 1_250_000_000,
    usedValue: 1_180_000_000,
    remainingValue: 70_000_000,
    usagePercent: 0.944,
    message: "🔴 [30 NGÀY] HĐ HD-2026-001 - Công ty CP Thiết bị Y tế Hà Nội hết hạn",
  },
  {
    contractId: "bc2",
    contractNumber: "HD-2026-008",
    supplierName: "Công ty TNHH Merck Việt Nam",
    endDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: 55,
    alertLevel: "WARNING",
    totalContractValue: 2_800_000_000,
    usedValue: 1_400_000_000,
    remainingValue: 1_400_000_000,
    usagePercent: 0.5,
    message: "🟡 [60 NGÀY] HĐ HD-2026-008 - Công ty TNHH Merck Việt Nam hết hạn",
  },
  {
    contractId: "bc3",
    contractNumber: "HD-2026-012",
    supplierName: "Công ty CP Sinh phẩm Roche",
    endDate: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysUntilExpiry: 85,
    alertLevel: "INFO",
    totalContractValue: 980_000_000,
    usedValue: 220_000_000,
    remainingValue: 760_000_000,
    usagePercent: 0.2245,
    message: "ℹ️ [90 NGÀY] HĐ HD-2026-012 - Công ty CP Sinh phẩm Roche hết hạn",
  },
];

// =============================================================================
// AUDIT LOG MOCKS
// =============================================================================

export const MOCK_AUDIT_LOG = {
  items: [
    {
      id: "al1",
      tableName: "lots",
      recordId: "lot-uuid-001",
      operation: "UPDATE",
      oldData: { status: "APPROVED", quantity: 100 },
      newData: { status: "IN_USE", quantity: 100, open_vial_opened_at: new Date().toISOString() },
      changedFields: ["status", "open_vial_opened_at"],
      changedBy: "u1",
      changedByEmail: "nguyen.a@khoaxn.vn",
      changedByRole: "KEEPER_DAILY_HC_SP",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: "al2",
      tableName: "products",
      recordId: "prod-uuid-002",
      operation: "INSERT",
      oldData: null,
      newData: { sku: "HBS-001", name: "HBsAg Test", cost_price: 250000 },
      changedFields: null,
      changedBy: "u2",
      changedByEmail: "tran.b@khoaxn.vn",
      changedByRole: "DEPT_HEAD",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "al3",
      tableName: "stock_movements",
      recordId: "sm-uuid-003",
      operation: "DELETE",
      oldData: { product_id: "p1", quantity: 50, type: "OUT" },
      newData: null,
      changedFields: null,
      changedBy: "u1",
      changedByEmail: "nguyen.a@khoaxn.vn",
      changedByRole: "KEEPER_DAILY_HC_SP",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
  ],
  page: 1,
  pageSize: 50,
};
