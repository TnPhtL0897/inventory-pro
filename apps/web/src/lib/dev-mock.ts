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
];

export const MOCK_WAREHOUSES = [
  { id: "w1", branchId: "b1", name: "Kho tổng HCM", code: "WH-HCM-01", address: "123 Nguyễn Văn Cừ, Q5", phone: "028-1234-5678", managerId: null, isDefault: true, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 5, createdAt: lastWeek, updatedAt: now },
  { id: "w2", branchId: "b1", name: "Kho phụ liệu", code: "WH-HCM-02", address: "456 Lê Hồng Phong, Q10", phone: "028-8765-4321", managerId: null, isDefault: false, allowNegative: false, status: "ACTIVE", type: "ISSUE", locationCount: 3, createdAt: lastWeek, updatedAt: now },
  { id: "w3", branchId: "b2", name: "Kho Hà Nội", code: "WH-HN-01", address: "789 Cầu Giấy, HN", phone: "024-1234-5678", managerId: null, isDefault: true, allowNegative: false, status: "ACTIVE", type: "RECEIVING", locationCount: 4, createdAt: lastWeek, updatedAt: now },
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
