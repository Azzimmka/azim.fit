const EARTH_RADIUS_METERS = 6_371_000;

export const GPS_MAX_ACCURACY_METERS = 50;
export const GPS_MIN_MOVEMENT_METERS = 2.5;
export const GPS_MAX_RUNNING_SPEED_METERS_PER_SECOND = 12;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function validCoordinatePoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  const accuracy = Number(point?.accuracy);
  const timestamp = Number(point?.timestamp);
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && Number.isFinite(accuracy)
    && accuracy >= 0
    && Number.isFinite(timestamp)
    && timestamp > 0;
}

export function haversineDistanceMeters(left, right) {
  if (!validCoordinatePoint({ ...left, accuracy: 0, timestamp: 1 })
    || !validCoordinatePoint({ ...right, accuracy: 0, timestamp: 1 })) return Number.NaN;
  const latitudeDelta = toRadians(Number(right.latitude) - Number(left.latitude));
  const longitudeDelta = toRadians(Number(right.longitude) - Number(left.longitude));
  const leftLatitude = toRadians(Number(left.latitude));
  const rightLatitude = toRadians(Number(right.latitude));
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/**
 * Assesses one browser position without returning either coordinate. The
 * caller may keep the accepted point only in memory as the next baseline.
 */
export function assessGpsPoint(previousPoint, nextPoint) {
  if (!validCoordinatePoint(nextPoint)) {
    return { accepted: false, baseline: false, deltaMeters: 0, signal: 'invalid' };
  }
  if (Number(nextPoint.accuracy) > GPS_MAX_ACCURACY_METERS) {
    return { accepted: false, baseline: false, deltaMeters: 0, signal: 'weak' };
  }
  if (!validCoordinatePoint(previousPoint)) {
    return { accepted: true, baseline: true, deltaMeters: 0, signal: 'good' };
  }
  const elapsedSeconds = (Number(nextPoint.timestamp) - Number(previousPoint.timestamp)) / 1_000;
  if (elapsedSeconds <= 0) {
    return { accepted: false, baseline: false, deltaMeters: 0, signal: 'stale' };
  }
  const distance = haversineDistanceMeters(previousPoint, nextPoint);
  if (!Number.isFinite(distance) || distance < GPS_MIN_MOVEMENT_METERS) {
    return { accepted: false, baseline: false, deltaMeters: 0, signal: 'stationary' };
  }
  if (distance / elapsedSeconds > GPS_MAX_RUNNING_SPEED_METERS_PER_SECOND) {
    return { accepted: false, baseline: false, deltaMeters: 0, signal: 'impossible' };
  }
  return {
    accepted: true,
    baseline: false,
    deltaMeters: Math.round(distance * 10) / 10,
    signal: 'good',
  };
}

