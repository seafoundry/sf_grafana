package identity

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	TypeUser           string = "user"
	TypeAPIKey         string = "api-key"
	TypeServiceAccount string = "service-account"
	TypeAnonymous      string = "anonymous"
	TypeRenderService  string = "render"
	TypeAccessPolicy   string = "access-policy"
	TypeProvisioning   string = "provisioning"
	TypeEmpty          string = ""
)

func ParseType(str string) (string, error) {
	switch str {
	case string(TypeUser):
		return TypeUser, nil
	case string(TypeAPIKey):
		return TypeAPIKey, nil
	case string(TypeServiceAccount):
		return TypeServiceAccount, nil
	case string(TypeAnonymous):
		return TypeAnonymous, nil
	case string(TypeRenderService):
		return TypeRenderService, nil
	case string(TypeAccessPolicy):
		return TypeAccessPolicy, nil
	default:
		return "", ErrInvalidTypedID.Errorf("got invalid identity type %s", str)
	}
}

// IsIdentityType returns true if type matches any expected identity type
func IsIdentityType(typ string, expected ...string) bool {
	for _, e := range expected {
		if typ == e {
			return true
		}
	}

	return false
}

var AnonymousTypedID = NewTypedID(TypeAnonymous, 0)

func ParseTypedID(str string) (TypedID, error) {
	var typeID TypedID

	parts := strings.Split(str, ":")
	if len(parts) != 2 {
		return typeID, ErrInvalidTypedID.Errorf("expected typed id to have 2 parts")
	}

	t, err := ParseType(parts[0])
	if err != nil {
		return typeID, err
	}

	return NewTypedIDString(t, parts[1]), nil
}

// MustParseTypedID parses namespace id, it will panic if it fails to do so.
// Suitable to use in tests or when we can guarantee that we pass a correct format.
func MustParseTypedID(str string) TypedID {
	typeID, err := ParseTypedID(str)
	if err != nil {
		panic(err)
	}
	return typeID
}

func NewTypedID(t string, id int64) TypedID {
	return TypedID(fmt.Sprintf("%s:%d", t, id))
}

// NewTypedIDString creates a new TypedID with a string id
func NewTypedIDString(t string, id string) TypedID {
	return TypedID(fmt.Sprintf("%s:%s", t, id))
}

type TypedID string

func (ni TypedID) ID() string {
	return ""
	// return ni.id
}

// UserID will try to parse and int64 identifier if namespace is either user or service-account.
// For all other namespaces '0' will be returned.
func (ni TypedID) UserID() (int64, error) {
	if ni.IsType(TypeUser, TypeServiceAccount) {
		return ni.ParseInt()
	}
	return 0, nil
}

// ParseInt will try to parse the id as an int64 identifier.
func (ni TypedID) ParseInt() (int64, error) {
	return strconv.ParseInt(ni.ID(), 10, 64)
}

func (ni TypedID) Type() string {
	return ""
	//return ni.t
}

func (ni TypedID) IsType(expected ...string) bool {
	return false
	//return IsIdentityType(ni.t, expected...)
}

func (ni TypedID) String() string {
	return string(ni)
}
