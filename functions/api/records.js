// ============================================================
// 新增：检查时间段是否与已有记录重叠（防重复补录）
// ============================================================
const overlapStmt = env.DB.prepare(`
    SELECT id, start_time, end_time
    FROM run_records
    WHERE device_id = ?
      AND (
          (start_time >= ? AND start_time < ?) OR
          (end_time > ? AND end_time <= ?) OR
          (start_time <= ? AND end_time >= ?)
      )
      AND is_corrected = 0
    LIMIT 1
`);
const overlap = await overlapStmt.bind(
    deviceId,
    startTime, endTime,
    startTime, endTime,
    startTime, endTime
).first();

if (overlap) {
    const overlapStart = formatTimestamp(overlap.start_time);
    const overlapEnd = formatTimestamp(overlap.end_time || overlap.start_time);
    return error(`该时间段（${overlapStart} ~ ${overlapEnd}）已有运行记录，请勿重复补录`, 400);
}
